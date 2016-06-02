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



