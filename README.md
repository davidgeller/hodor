hodor
=====
Node.js application for Raspberry Pi to manage a garage door using multiple entry codes and availability times and days. Utilizes a 4x4 keypad for code entry, Twilio for sending SMS alerts and a one channel relay for activating a garage door (can easily be modified to control multiple relays and multiple doors). Also utilizes the Raspberry Pi GPIO library for node.js by Jonathan Perkin (https://github.com/jperkin/node-rpio).

## Compatibility

* Raspberry Pi Models: 2, 3.
* Node.js Versions: 4.x, 5.x, 6.x
* 

## Hardware

* Raspberry Pi Model 3
* Single Relay Module (5V)
* 4x4 matrix keypad
* Some length of CAT5 cable (8 conductors, total) for wiring keypad
* 3D printed case for Raspberry Pi + single channel relay

## Software Installation

The software is comprised of the `hodor_app.js` file and a single configuration file named `config.json`. Clone the files in this repository and copy the `config_example.json` to `config.json` and update it to reflect your personal preferences in terms of activation codes, GPIO pin for the relay and Twilio account information for sending SMS messages.

Jonathan Perkin's GPIO library for Node.js and Raspberry Pi is required. Grab it here: https://github.com/jperkin/node-rpio

Here are the complete installation steps:

### Update Node on your Raspberry Pi

```console
$ sudo apt-get update nodejs
```

### Install Node's package manager

```console
$ sudo apt-get install npm
```

### Install GPIO Library

```console
$ npm install rpio
```

### Install Twilio library

```console
$ npm install twilio
```
## Software Configuration

The configuration file for `hodor` is a sinle JSON file. Door entry codes are represented by JSON objects stored in a array associated with the name `entries`. An example entry looks like:

```js
{
    "name": "Bran",
    "code": "721136",
    "alert": "all",
    "message": "Bran has safely exited the cave",
    "valid_days": {
        "tuesday": 1,
        "wednesday": 1
    },
    "valid_hours": {
        "start": 8,
        "end": 15
    }
}
```

This entry is associated with someone named `Bran` and indicates that their door entry code is `721136`. With this app they would enter `*` to begin, followed by `721136` and then `#` to indicate that they're done entering their code. To send an alert, via SMS, when this code is used be sure there's a value associated with `alert`. In this example is points to an alert named `all` (see alerts below).

#### Restricting which days a code can be used

If you'd like to limit which days a door entry may be used create entries in the JSON object named `valid_days`. To reduce the complexity of parsing a simple format is utilized. For each day that you want to allow access create a JSON entry with the day's name (i.e. 'sunday', 'monday', etc.) and then a value next to it. Hodor doesn't really care about the value. It just looks to see if that day is present.

#### Restricting when a code can be used during the day

If you'd like to limit which hours of the day a door entry may be used, create entries in the JSON object named `valid_hours`. To reduce the complexity of parsing, a simple format is utilized. A single time span is represented by two values associated with the names `start` and `end`. Military (24 hour) time is used (i.e. 3PM is 15, 4PM is 16, etc.).


If you want to allow a code to be used any hour of the day, simple leave out the `valid_hours` object for a given entry entirely.

#### SMS Message

Unless otherwise specified, SMS messages generated and sent for a specific entry code will simply say the name of the entry follwed by the text `has opened the door.` If you'd like to have more control, you can create a specific `message` for an entry (as shown in the example above).

### Alerts

Sending SMS alerts is performed using the Twilio library for Node.js. You'll need to have an account with Twilio and obtain three things to successfully have hodor send alerts: your accound SID, your AUTH_TOKEN and a telephone number your messages will appear to come from. This number is provided by Twilio. The area of the configuration file associated with Twilio looks like:

```js
"twilio": {
    "account_sid": "---your twilio SID goes here---",
    "auth_token": "---your twilio auth token-------",
    "my_number": "---your Twilio from phone number---"
}
```
## Hardware Setup

Perhaps the most challenging part of this project was determining how to setup the physical keypad and relay. The devices selected for this prject were a 4x4 matrix keypad  (approximate cost $7.49US) and a one channel 5V relay compatible with Raspberry Pi and Arduino (approximate cost $4.95US).

Currently the code hardcodes rows and columns for the matrix keyboard and utilizes the following GPIO pins

Columns
```
GPIO06, GPIO13, GPIO19, GPIO26,
```

Rows
```
GPIO12, GPIO16, GPIO20, GPIO21
```

This keeps the eight wires from the keypad nicely situated on one end of the Pi's GPIO header. It's important to note that the GPIO package used to control the pins, by default, uses physical pin numbers, as is represented in the code. Future versions will abstract these values to the configuration file.

#### Keypad wiring

TBD

#### Relay controls

There are two entries in the configuration file associated with the relay. `relay_delay_msec` specifies the number of miliseconds to wait before flipping the relay off after it has been activated. 500 msec (half a second) seems reasonable. Be sure to test with your garage door opener and adjust as necessary.

The second entry `relay_pin` specifies the physical pin to wire to the relay's input/trigger. The other two wires will need to be wired to the Pi's 5V and GND pins, respectfully.
