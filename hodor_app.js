var rpio = require('rpio');
var twilio = require('twilio');
var config = require('./config.json');

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
var TOOLONG_MSEC = 2500;
var currentCode = '';

var twilio_account = config.twilio;
var twilio_client = null;

function setupTwilio () {
    if (twilio_account == null) {
        console.log ('Twilio configuration not found');
        return;
    }

    console.log ('Configuring Twilio for SMS alerts...');
    var twilio_client = new twilio.RestClient(twilio_account["account_sid"], twilio_account["auth_token"]);
}

// --------------------------------------------------------------------
// Setup our initial state for our GPIO pins
// --------------------------------------------------------------------
function setupPins () {
    for (var j = 0; j < COLS.length; j++) {
        rpio.open(COLS[j], rpio.OUTPUT, rpio.PULL_DOWN);
    }

    for (var i = 0; i < ROWS.length; i++) {
        rpio.open(ROWS[i], rpio.INPUT, rpio.PULL_DOWN);
    }
}

// --------------------------------------------------------------------
// Setup column pins for INPUT - we change the
// state for these, so this makes it easy to
// change back
// --------------------------------------------------------------------
function setColsInput () {
    for (var j = 0; j < COLS.length; j++) {
        rpio.open(COLS[j], rpio.INPUT, rpio.PULL_DOWN);
    }
}

// --------------------------------------------------------------------
// buttonHandler - called whenever a button is pressed
// --------------------------------------------------------------------
function buttonHandler (cbpin)
{
    //var state = rpio.read(cbpin) ? 'pressed' : 'released';
    //console.log('Button event on P%d (button currently %s)', cbpin, state);
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

    for (var i = 0; i < COLS.length; i++) {
        var state = rpio.read (COLS[i]);
        buttons += '' + state;

        if (state) {
            col = getCol (COLS[i]);
        }
    }

    var digit = '';

    if (row > 0 && col > 0)
        digit = digits [row-1][col-1];

    //console.log (out + ' ' + buttons + ' ' + digit);
    //console.log (digit);

    setupPins ();
    setupHandlers (true);

    if (digit.length > 0)
        handleKeyPress (digit);
}

// --------------------------------------------------------------------
// getRow - figure out what row we're on based on GPIO mapping
// --------------------------------------------------------------------
function getRow (pin) {

    for (var i = 0; i < ROWS.length; i++) {
        if (ROWS[i] == pin)
                return i+1;
    }

    return 0;
}

// --------------------------------------------------------------------
// getCol - figure out what column we're on based on GPIO mapping
// --------------------------------------------------------------------
function getCol (pin) {

    for (var i = 0; i < COLS.length; i++) {
        if (COLS[i] == pin)
            return i+1;
    }

    return 0;
}

// --------------------------------------------------------------------
// setupHandlers - configure interupt handers for all our GPIO pins
// --------------------------------------------------------------------
function setupHandlers (active) {

        for (j = 0; j < COLS.length; j++) {
            //console.log ('Setting up pin ' + COLS[j] + '...');
            rpio.poll (COLS[j], active ? buttonHandler : null);
        }

        for (j = 0; j < ROWS.length; j++) {
            //console.log ('Setting up pin ' + ROWS[j] + '...');
            rpio.poll (ROWS[j], active ? buttonHandler : null);
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

        default:
            if (depressFrequencyTooLong (timeBetweenKeysMsec)) {
                console.log (key + ' pressed after ' + timeBetweenKeysMsec + ' msec (TOO LONG)');
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

    var now = new Date ();
    msec = now.getTime() - last.getTime();
    return msec;
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
        console.log ('Code: ' + currentCode);

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
        console.log ('No entry found for ' + code);
        return;
    }

    console.log ("Entry [" + code + "]");
    console.log ("\tname: " + entry.name);
    console.log ("\talert: " + entry.alert);
    console.log ("\tvalid_days: " + JSON.stringify (entry.valid_days));
    console.log ("\tvalid_hours: " + JSON.stringify (entry.valid_hours));

    if (isValidDay(entry) && isValidHour(entry)) {
        triggerDoorRelay ();
        sendSMSMessage (entry);
    }
    else {
        console.log ('ACCESS NOT PERMITTED at this time');
    }
}

// --------------------------------------------------------------------
// pull details of our code from our configuration data; null if
// not found
// --------------------------------------------------------------------
function getCodeDetails (code) {

    for (var i = 0; i < config.entries.length; i++) {

        var entry = config.entries [i];
        if (entry != null && entry.code == code) {
            return entry;
        }
    }

    return null;
}

// --------------------------------------------------------------------
//
// --------------------------------------------------------------------
function isValidDay (entry) {
    if (entry.valid_days == null)
        return true;

    var now = new Date();
    var day = now.getDay ();
    var day_string = days [day];

    console.log ('Day: ' + day);
    console.log ('entry.valid_days [' + day_string + '] ' + entry.valid_days [days[day]]);

    if (entry.valid_days [days[day]] != null)
        return true;

    return false;
}

// --------------------------------------------------------------------
//
// --------------------------------------------------------------------
function isValidHour (entry) {

    if (entry.valid_hours == null)
        return true;

    var now = new Date();
    var hour = now.getHours ();

    var valid_start = entry.valid_hours ["start"];
    var valid_end = entry.valid_hours ["end"];

    console.log ('Current hour: ' + hour + ' valid start: ' + valid_start + ' end: ' + valid_end);
    return (hour >= valid_start && hour <= valid_end);
}

// --------------------------------------------------------------------
//
// --------------------------------------------------------------------
function triggerDoorRelay () {
    console.log ('Triggering door relay!');
    triggerRelayPin ();
}

// --------------------------------------------------------------------
// send an SMS to everyone in the alert list
// --------------------------------------------------------------------
function sendSMSMessage (entry) {

    if (twilio_client == null) {
        return;
    }

    var msg = entry.message;

    if (msg == null || msg.length == 0)
        msg = entry.name + ' has opened the garage door';

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
            console.log('Success! SID: ' + message.sid + ' sent: ' + message.dateCreated);
        } else {
            console.log('Oops! There was an error.');
        }
    });
}

// --------------------------------------------------------------------
// setup relay pin
// --------------------------------------------------------------------
function triggerRelayPin () {
    var relay_pin = config.relay_pin;
    var relay_delay_msec = config.relay_delay_msec;

    //console.log ('Turning GPIO ' + relay_pin + ' on...');
    rpio.open(relay_pin, rpio.OUTPUT);
    rpio.write (relay_pin, rpio.HIGH);

    setTimeout(function() {
        //console.log ('Turning GPIO ' + relay_pin + ' off...');
        rpio.open(relay_pin, rpio.OUTPUT);
        rpio.write (relay_pin, rpio.LOW);
        rpio.close (relay_pin);
    }, relay_delay_msec);

}

console.log ('------------------------------------------------------');
console.log ('H O D O R');
console.log ('Version: 1.0 June 2, 2016');
console.log ('by David Geller')
console.log ('Released as open source under the GPL')
console.log ('------------------------------------------------------');

console.log ('Twilio account SID: ' + config.twilio.account_sid);

for (var i = 0; i < config.entries.length; i++)
    console.log ('Code found for: ' + config.entries[i].name);

setupPins ();
setupHandlers (true);
setupTwilio ();

console.log ('Listening...');
