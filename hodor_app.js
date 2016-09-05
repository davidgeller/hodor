// --------------------------------------------------------------------
// HODOR
//
// Garage door control software for the Raspberry Pi with Node.js
//
// Author: David Geller (June, 2016)
//
// Copyright (C) 2016.
//
// License: Open Source through GPL.
//
// Utilizes https://github.com/jperkin/node-rpio by Jonathan Perkins
// for GPIO control.
//
// --------------------------------------------------------------------

var rpio = require('rpio');
var twilio = require('twilio');
var config = require('./config.json');
var moment = require('moment');

var COLS = [32,36,38,40];
var ROWS = [31,33,35,37];

var digits = [  [ "1", "2", "3", "A"],
                [ "4", "5", "6", "B"],
                [ "7", "8", "9", "C"],
                [ "*", "0", "#", "D"]
            ];

var days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

var lastKeyPressed = null;
var timeBetweenKeysMsec = 0;
var TOOLONG_MSEC = config.timeout_msec;
var TESTMODE_TIMEOUT_MSEC = 2 * 1000 * 60;
var currentCode = '';

var twilio_account = config.twilio;
var twilio_client = null;

var isTestMode = false;
var testmodeEntry = null;
var doorOpened = false;

var relay_pin = config.relay_pin;
var sensor_pin = config.sensor_pin;

var keyPadRows = config.keypad.rows;
var keyPadCols = config.keypad.cols;

var lastSuccessfulCode = null;
var lastEntry = null;
var close_helper_seconds = config.close_helper_seconds;
var temp_code_timeout_minutes = config.temp_code_ttl_minutes;

// --------------------------------------------------------------------
// Setup our Twilio object for sending SMS messages
// --------------------------------------------------------------------
function setupTwilio () {
    if (twilio_account == null) {
        logOut ('Twilio configuration not found');
        return;
    }

    logOut ('Configuring Twilio for SMS alerts...');
    twilio_client = new twilio.RestClient(twilio_account["account_sid"], twilio_account["auth_token"]);
}

// --------------------------------------------------------------------
// Setup initial state of relay pin(s)
// --------------------------------------------------------------------
function setupRelayPins () {
    rpio.open(relay_pin, rpio.INPUT, rpio.LOW);
}

// --------------------------------------------------------------------
// Setup our sensor pin handler so we can detected when our door is
// open
// --------------------------------------------------------------------
function setupSensorPin () {
    rpio.open(sensor_pin, rpio.INPUT, rpio.PULL_UP);
    //rpio.poll (sensor_pin, sensorHandler);
}

// --------------------------------------------------------------------
// Is our door open?
// --------------------------------------------------------------------
function isDoorOpen () {
    var sensor_state = !rpio.read (sensor_pin);
    logOut ("isDoorOpen: state = " + (sensor_state ? 'OPENED' : 'CLOSED'));
    return sensor_state;
}

// --------------------------------------------------------------------
// detect when our magnetic sensor is triggered. We've positioned it
// in the open position.
// --------------------------------------------------------------------
function sensorHandler (pin) {
    var state = rpio.read(pin);
    logOut ("sensorHandler sensor state: " + state);
}

// --------------------------------------------------------------------
// Setup our initial state for our GPIO pins
// --------------------------------------------------------------------
function setupKeyPadPins () {
    for (var j = 0; j < keyPadCols.length; j++) {
        rpio.open(keyPadCols[j], rpio.OUTPUT, rpio.PULL_DOWN);
    }

    for (var i = 0; i < keyPadRows.length; i++) {
        rpio.open(keyPadRows[i], rpio.INPUT, rpio.PULL_DOWN);
    }
}

// --------------------------------------------------------------------
// Setup column pins for INPUT - we change the
// state for these, so this makes it easy to
// change back
// --------------------------------------------------------------------
function setColsInput () {
    for (var j = 0; j < keyPadCols.length; j++) {
        rpio.open(keyPadCols[j], rpio.INPUT, rpio.PULL_DOWN);
    }
}

// --------------------------------------------------------------------
// buttonHandler - called whenever a button is pressed
// --------------------------------------------------------------------
function buttonHandler (cbpin)
{
    //var state = rpio.read(cbpin) ? 'pressed' : 'released';
    //logOut('Button event on P%d (button currently %s)', cbpin, state);
    var pressed = rpio.read(cbpin);

    if (!pressed)
        return;

    setupHandlers (false);
    setColsInput ();

    rpio.open (cbpin, rpio.INPUT, rpio.PULL_UP);

    var out = 'P' + cbpin;

    var buttons = '';
    var row = getRow (cbpin);
    var col = 0;

    for (var i = 0; i < keyPadCols.length; i++) {
        var state = rpio.read (keyPadCols[i]);
        buttons += '' + state;

        if (state) {
            col = getCol (keyPadCols[i]);
        }
    }

    var digit = '';

    if (row > 0 && col > 0)
        digit = digits [row-1][col-1];

    //logOut (out + ' ' + buttons + ' ' + digit);
    //logOut (digit);

    setupKeyPadPins ();
    setupHandlers (true);

    if (digit.length > 0)
        handleKeyPress (digit);
}

// --------------------------------------------------------------------
// getRow - figure out what row we're on based on GPIO mapping
// --------------------------------------------------------------------
function getRow (pin) {

    for (var i = 0; i < keyPadRows.length; i++) {
        if (keyPadRows[i] == pin)
                return i+1;
    }

    return 0;
}

// --------------------------------------------------------------------
// getCol - figure out what column we're on based on GPIO mapping
// --------------------------------------------------------------------
function getCol (pin) {

    for (var i = 0; i < keyPadCols.length; i++) {
        if (keyPadCols[i] == pin)
            return i+1;
    }

    return 0;
}

// --------------------------------------------------------------------
// setupHandlers - configure interupt handers for all our GPIO pins
// --------------------------------------------------------------------
function setupHandlers (active) {

        for (j = 0; j < keyPadCols.length; j++) {
            //logOut ('Setting up pin ' + COLS[j] + '...');
            rpio.poll (keyPadCols[j], active ? buttonHandler : null);
        }

        for (j = 0; j < keyPadRows.length; j++) {
            //logOut ('Setting up pin ' + ROWS[j] + '...');
            rpio.poll (keyPadRows[j], active ? buttonHandler : null);
        }
}

// --------------------------------------------------------------------
// handle a key press
// --------------------------------------------------------------------
function handleKeyPress (key) {

    if (lastKeyPressed == null) {
        timeBetweenKeysMsec = 0;
    }
    else {
        timeBetweenKeysMsec = getMSecSinceLastPress (lastKeyPressed);
    }

    lastKeyPressed = new Date ();

    switch (key) {
        case '*':
            handleStar ();
            break;

        case '#':
            handlePound ();
            break;

        //case 'D':
        //    triggerRelayPin ();
        //    break;

        case 'C':
            handleCButton ();
            break;

        default:
            if (depressFrequencyTooLong (timeBetweenKeysMsec)) {
                logOut (key + ' pressed after ' + timeBetweenKeysMsec + ' msec (TOO LONG)');
                clearEntry ();
            }
            else {
                handleDigit (key);
            }
        break;
    }
}

// --------------------------------------------------------------------
// how many seconds since our last key press?
// --------------------------------------------------------------------
function getMSecSinceLastPress (last) {
    return secondsSince (last);
}

// --------------------------------------------------------------------
// when was our last successful code entry?
// --------------------------------------------------------------------
function getSecondsSinceLastSuccessfulCode () {
    return secondsSince (lastSuccessfulCode);
}

// --------------------------------------------------------------------
// Return seconds since the supplied date
// --------------------------------------------------------------------
function secondsSince (d) {

    if (d == null)
        return 0;

    var now = new Date ();
    msec = now.getTime() - d.getTime();
    return (msec/1000);
}

// --------------------------------------------------------------------
// We will start all entries with *
// --------------------------------------------------------------------
function handleStar () {
    startEntry ();
}

// --------------------------------------------------------------------
// We will end entries with #
// --------------------------------------------------------------------
function handlePound () {
    endEntry ();
}

// --------------------------------------------------------------------
// Easy way to close the door
// --------------------------------------------------------------------
function handleCButton () {

    var sec = getSecondsSinceLastSuccessfulCode ();

    if (sec == 0 || sec > close_helper_seconds) {
        logOut ('handleCButton: threshold since last valid entry has passed; ignoring');
        return;
    }

    if (!isDoorOpen()) {
        logOut ('handleCButton: door was NOT open; ignoring');
        return;
    }

    triggerDoorRelay ();

    if (lastEntry != null)
        sendSMSMessage (lastEntry);
}

// --------------------------------------------------------------------
// clear our entry stack
// --------------------------------------------------------------------
function clearEntry () {
    currentCode = '';
}

// --------------------------------------------------------------------
// accumulate digits
// --------------------------------------------------------------------
function handleDigit (d) {
    currentCode += d;
}

// --------------------------------------------------------------------
// what to do when we're done entering digits
// --------------------------------------------------------------------
function endEntry () {
    if (currentCode.length > 0) {
        logOut ('Code: ' + currentCode);

        handleCode (currentCode);
        clearEntry ();
    }
}

// --------------------------------------------------------------------
// did we take too long between key presses?
// --------------------------------------------------------------------
function depressFrequencyTooLong (msec) {
    return (msec > TOOLONG_MSEC);
}

// --------------------------------------------------------------------
// start a new entry
// --------------------------------------------------------------------
function startEntry () {
    clearEntry ();
}

// --------------------------------------------------------------------
// do something with the code we've received from input
// --------------------------------------------------------------------
function handleCode (code) {

    var entry = getCodeDetails (code);
    if (entry == null) {
        logOut ('No entry found for ' + code);
        return;
    }

    logOut ("Entry [" + code + "]");
    logOut ("\tname: " + entry.name);
    logOut ("\talert: " + entry.alert);
    logOut ("\tvalid_days: " + JSON.stringify (entry.valid_days));
    logOut ("\tvalid_hours: " + JSON.stringify (entry.valid_hours));

    if (isValidDay(entry) && isValidHour(entry)) {

        if (entry.testmode != null && entry.testmode == 1) {

            // if we're in testmode - then toggle it off
            if (isTestMode) {
                isTestMode = false;
                sendSMSMessageTestMode (entry, "Test mode deactivated");
                return;
            }

            isTestMode = true;

            testmodeEntry = entry;
            // alert that we're in test mode
            sendSMSMessageTestMode (entry, "Test mode ACTIVE");

            // automatically turn off test mode if we forget
            setTimeout(function() {
                logOut ('Turning off test mode');
                sendSMSMessageTestMode (testmodeEntry, "Test deactivated after " + TESTMODE_TIMEOUT_MSEC/1000 + ' seconds');
                isTestMode = false;
            }, TESTMODE_TIMEOUT_MSEC);
        }

        if (!isTestMode) {

            triggerDoorRelay ();
            sendSMSMessage (entry);

            lastSuccessfulCode = new Date ();
            lastEntry = entry;
        }
        else {
            sendSMSMessageTestMode (testmodeEntry, "Test Mode: code = " + code);
        }
    }
    else {
        logOut ('ACCESS NOT PERMITTED at this time');

        if (entry.temp_code_allowed == 1) {
            createTemporaryCode(entry);
        }
    }
}


// --------------------------------------------------------------------
// Create a temporary code for someone who's code isn't working
// or has shown up unscheduled. This code will be sent via SMS
// to the admin group who can decide whether to share it with the
// person(s) seeking access. It's designed to last for a short-time.
// --------------------------------------------------------------------
function createTemporaryCode (entry) {

    logOut ('Creating temporary code for ' + entry.name + '...');
    var sec_since_last_temp_code_generated = entry.sec_since_last_temp_code_generated;
    var temp_code_timeout_sec = config.temp_code_timeout_seconds;

    if (temp_code_timeout_sec == null)
        temp_code_timeout_sec = 120;

    if (sec_since_last_temp_code_generated != null && secondsSince (sec_since_last_temp_code_generated) < temp_code_timeout_sec) {
        logOut ('It has been less than ' + temp_code_timeout_sec + ' seconds since last code generated; ignoring.');
        return;
    }

    // mark the time we're generating a new code
    entry.sec_since_last_temp_code_generated = new Date ();
    createTemporaryEntry (entry);
}

// --------------------------------------------------------------------
// Create a new in-memory entry to store a temporary code. These will
// go away if Hodor is restarted
// --------------------------------------------------------------------
function createTemporaryEntry (entry) {

    var name = "Temp entry for " + entry.name;
    var code = generateRandomChars (5, '0123456789');
    var expiration_msec = entry.sec_since_last_temp_code_generated.getTime()  + (config.temp_code_ttl_minutes * 60 * 1000);
    var expires = new Date (expiration_msec);

    var tempEntry = {
        "name": name,
        "code": code,
        "alert": entry.alert,
        "expires": expires
    };

    // add this new entry to our array of entries
    config.entries.push (tempEntry);

    logOut ('Temporary code ' + code + ' for ' + entry.name + ' will expire ' + expires);

    //logOut ('tempEntry: ' + JSON.stringify(tempEntry) );
    //logOut ('config.entries: ' + JSON.stringify(config.entries) );

    var msg = "A temporary code (" + code + ") has been created for " +
        entry.name + ". if you wish to share it, it's valid for " +
        config.temp_code_ttl_minutes + " minutes.";

    sendSMSMessageForEntry (entry, msg);
}

// --------------------------------------------------------------------
// Generate a 'len' number of random characters from the specified
// 'string'. Code taken from example shared in the post:
// http://stackoverflow.com/questions/10726909/random-alpha-numeric-string-in-javascript
// --------------------------------------------------------------------
function generateRandomChars (len, string) {

    var result = '';

    for (var i = len; i > 0; --i)
        result += string[Math.floor(Math.random() * string.length)];

    return result;
}

// --------------------------------------------------------------------
// pull details of our code from our configuration data; null if
// not found. Now checks to see if the entry has an expiration timestamp
// and will check it if found.
// --------------------------------------------------------------------
function getCodeDetails (code) {

    for (var i = 0; i < config.entries.length; i++) {

        var entry = config.entries [i];
        if (entry != null && entry.code == code) {

            var expires = entry.expires;
            var now = new Date ();

            if (expires != null) {
                if (now.getTime() > expires.getTime()) {
                    logOut (entry.name + ' EXPIRED');
                    return null;
                }
            }

            return entry;
        }
    }

    return null;
}

// --------------------------------------------------------------------
// Is this entry valid for the current day?
// --------------------------------------------------------------------
function isValidDay (entry) {
    if (entry.valid_days == null)
        return true;

    var now = new Date();
    var day = now.getDay ();
    var day_string = days [day];

    logOut ('Day: ' + day);
    logOut ('entry.valid_days [' + day_string + '] ' + entry.valid_days [days[day]]);

    if (entry.valid_days [days[day]] != null)
        return true;

    return false;
}

// --------------------------------------------------------------------
// is this entry valid for the current hour?
// --------------------------------------------------------------------
function isValidHour (entry) {

    if (entry.valid_hours == null)
        return true;

    var now = new Date();
    var hour = now.getHours ();

    var valid_start = entry.valid_hours ["start"];
    var valid_end = entry.valid_hours ["end"];

    logOut ('Current hour: ' + hour + ' valid start: ' + valid_start + ' end: ' + valid_end);
    return (hour >= valid_start && hour <= valid_end);
}

// --------------------------------------------------------------------
// Trigger (activate) the door relay
// --------------------------------------------------------------------
function triggerDoorRelay () {
    logOut ('Triggering door relay!');
    triggerRelayPin ();
}

// --------------------------------------------------------------------
// send an SMS to everyone in the alert list for a given entry regarding
// the door action being taken
// --------------------------------------------------------------------
function sendSMSMessage (entry) {

    var msg = entry.message;
    var door_open = isDoorOpen ();

    if (msg == null || msg.length == 0)
        msg = entry.name + ' has ' + (door_open ? 'closed' : 'opened') + ' the door';

    sendSMSMessageForEntry (entry, msg);
}

// --------------------------------------------------------------------
// Send a message to the alert group associated with an entry
// --------------------------------------------------------------------
function sendSMSMessageForEntry (entry, msg) {
    if (twilio_client == null) {
        return;
    }

    if (msg == null || msg.length == 0) {
        logOut ('No message specified; ignoring');
        return;
    }

    var alert_code = entry.alert;
    if (alert_code != null && alert_code.length > 0) {

        var sms_numbers = config.alerts [alert_code];

        if (sms_numbers == null || sms_numbers.length == 0) {
            logOut ('No SMS numbers specified for ' + entry.name + '; ignoring.');
            return;
        }

        for (var i = 0; i < sms_numbers.length; i++) {
            sendSMSviaTwilio (sms_numbers[i], msg);
        }
    }

}

// --------------------------------------------------------------------
// send SMS message while in test mode
// --------------------------------------------------------------------
function sendSMSMessageTestMode (entry, msg) {
    if (twilio_client == null) {
        return;
    }

    var alert_code = entry.alert;
    if (alert_code != null && alert_code.length > 0) {

        var sms_numbers = config.alerts [alert_code];

        if (sms_numbers == null || sms_numbers.length == 0) {
            return;
        }

        for (var i = 0; i < sms_numbers.length; i++) {
            sendSMSviaTwilio (sms_numbers[i], msg);
        }
    }
}

// --------------------------------------------------------------------
// Send a support message to the support alert group
// --------------------------------------------------------------------
function sendSupportSMSMessage (msg) {
    if (twilio_client == null) {
        return;
    }

    var sms_numbers = config.alerts ["support"];

    if (sms_numbers == null || sms_numbers.length == 0) {
        return;
    }

    for (var i = 0; i < sms_numbers.length; i++) {
        sendSMSviaTwilio (sms_numbers[i], msg);
    }
}

// --------------------------------------------------------------------
// Use Twilio to send an SMS message
// --------------------------------------------------------------------
function sendSMSviaTwilio (to, msg) {

    var my_number = config.twilio["my_number"];

    twilio_client.sms.messages.create({
        to: '+1' + to,
        from: my_number,
        body: msg
    }, function(error, message) {
        // The HTTP request to Twilio will run asynchronously. This callback
        // function will be called when a response is received from Twilio
        // The "error" variable will contain error information, if any.
        // If the request was successful, this value will be "falsy"
        if (!error) {
            // The second argument to the callback will contain the information
            // sent back by Twilio for the request. In this case, it is the
            // information about the text messsage you just sent:
            logOut('Success! SID: ' + message.sid + ' sent: ' + message.dateCreated);
        } else {
            logOut('Oops! There was an error.');
        }
    });
}

// --------------------------------------------------------------------
// setup relay pin
// --------------------------------------------------------------------
function triggerRelayPin () {
    var relay_pin = config.relay_pin;
    var relay_delay_msec = config.relay_delay_msec;

    //logOut ('Turning GPIO ' + relay_pin + ' on...');
    rpio.open(relay_pin, rpio.OUTPUT);
    rpio.write (relay_pin, rpio.HIGH);

    setTimeout(function() {
        //logOut ('Turning GPIO ' + relay_pin + ' off...');
        rpio.open(relay_pin, rpio.OUTPUT);
        rpio.write (relay_pin, rpio.LOW);
        rpio.close (relay_pin);
    }, relay_delay_msec);

}

// --------------------------------------------------------------------
// Log message to console with timestamp
// --------------------------------------------------------------------
function logOut (msg) {
    var ds = moment().format('MM/DD/YYYY HH:mm:ss');
    console.log (ds + ' ' + msg);
}

if (close_helper_seconds == null || close_helper_seconds == 0)
    close_helper_seconds = 90;

logOut ('------------------------------------------------------');
logOut ('H O D O R');
logOut ('Version: 1.6 September 4, 2016');
logOut ('by David Geller')
logOut ('Released as open source under the GPL')
logOut ('------------------------------------------------------');

logOut ('Twilio account SID: ' + config.twilio.account_sid);
logOut ('Keypad Columns: ' + JSON.stringify (keyPadCols));
logOut ('Keypad Rows: ' + JSON.stringify (keyPadRows));
logOut ('Relay pin: ' + relay_pin);
logOut ('Sensor pin: ' + sensor_pin);
logOut ('Timeout msec: ' + TOOLONG_MSEC);
logOut ('Close helper threshold (sec): ' + close_helper_seconds);

for (var i = 0; i < config.entries.length; i++)
    logOut ('Code found for: ' + config.entries[i].name);

setupRelayPins ();
setupSensorPin ();
isDoorOpen ();
setupKeyPadPins ();
setupHandlers (true);
setupTwilio ();

logOut ('Listening...');

sendSupportSMSMessage ("Hodor 1.6 is now active!");
