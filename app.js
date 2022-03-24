#!/usr/bin/env node

const Mqtt = require('mqtt');
const Lirc = require('lirc-client');
const log = require('yalm');

const config = {
	lircHost: '127.0.0.1',
	lircPort: 8765,
	mqttUrl: 'mqtt://192.168.0.234',
	mqttUsername: 'mqttuser',
	mqttPassword: 'mqttpassword',
	device: 'zigbee2mqtt/0xa4c138870f3edb74',
	topic: 'lirc',
	json: false,
};

log.setLevel('debug');

let lircConnected;

log.info(
	'lirc trying to connect on ' + config.lircHost + ':' + config.lircHost
);

const lirc = new Lirc({
	host: config.lircHost,
	port: config.lircPort,
});

if (typeof config.topic !== 'string') {
	config.topic = '';
}
if (config.topic !== '' && !config.topic.match(/\/$/)) {
	config.topic += '/';
}

let mqttConnected;

log.info('mqtt trying to connect', config.mqttUrl);
const mqtt = Mqtt.connect(config.mqttUrl, {
	username: config.mqttUsername,
	password: config.mqttPassword,
	port: 1883,
	will: { topic: config.device + '/connected', payload: '0' },
});

mqtt.on('connect', () => {
	mqttConnected = true;
	log.info('mqtt connected ' + config.mqttUrl);
	mqtt.publish(config.device + '/connected', lircConnected ? '2' : '1');
	log.info('mqtt subscribe', config.device + '/set/#');
	// mqtt.subscribe(config.device + '/set/+/+');
	mqtt.subscribe(config.device);
});

mqtt.on('close', () => {
	if (mqttConnected) {
		mqttConnected = false;
		log.info('mqtt closed ' + config.mqttUrl);
	}
});

mqtt.on('error', (err) => {
	log.error('mqtt', err);
});

lirc.on('connect', () => {
	log.info('lirc connected');
	lircConnected = true;
	mqtt.publish(config.device + '/connected', '2');
});

lirc.on('disconnect', () => {
	if (lircConnected) {
		log.info('lirc connection closed');
		lircConnected = false;
		mqtt.publish(config.device + '/connected', '1');
	}
});

lirc.on('error', (err) => {
	log.error('lirc', err);
});

lirc.on('receive', (remote, command, repeats) => {
	log.debug('receive', remote, command, repeats);
	const topic = config.topic + '/status/' + remote + '/' + command;
	let payload;
	if (config.json) {
		payload = JSON.stringify({
			val: parseInt(repeats, 10),
		});
	} else {
		payload = String(parseInt(repeats, 10));
	}
	log.debug('mqtt >', topic, payload);
	mqtt.publish(topic, payload);
});

mqtt.on('message', (topic, payload) => {
	payload = payload.toString();
	log.debug('mqtt <', topic, payload);

	if (!lircConnected) {
		log.error("lirc disconnected. can't send command.");
		return;
	}

	const [, , remote, key] = topic.split('/');
	let repeats = 0;
	let cmd = 'SEND_ONCE';

	if (payload.toUpperCase() === 'START') {
		cmd = 'SEND_START';
	} else if (payload.toUpperCase() === 'STOP') {
		cmd = 'SEND_STOP';
	} else if (payload) {
		repeats = parseInt(payload, 10) || 0;
	}

	if (repeats) {
		lirc.cmd(cmd, remote, key, repeats, () => {
			log.debug('lirc >', cmd, remote, key, repeats);
		});
	} else {
		lirc.cmd(cmd, remote, key, () => {
			log.debug('lirc >', cmd, remote, key);
		});
	}
});
