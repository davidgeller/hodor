hodor
=====
Node.js application for Raspberry Pi to manage a garage door using multiple entry codes and availability times and days. Utilizes a 4x4 keypad for code entry, Twilio for sending SMS alerts and a one channel relay for activating a garage door (can easily be modified to control multiple relays and multiple doors). Also utilizes the Raspberry Pi GPIO library for node.js by Jonathan Perkin (https://github.com/jperkin/node-rpio).

## Compatibility

* Raspberry Pi Models: 2, 3.
* Node.js Versions: 4.x, 5.x, 6.x

## Install

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
## Configuration

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

Send SMS alerts is performed using the Twilio library for Node.js. You'll need to have an account with Twilio and obtain three things to successfully have hodor send alerts.


