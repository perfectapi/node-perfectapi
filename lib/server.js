var path = require('path');
var express = require('express');
var cfg = require('./config.js');
var middleware = require('./connect.js');
var url = require('url');
var fs = require('fs');
var logger = require('winston').loggers.get('perfectapi');
var responder = require('./responder.js');

exports.listen = function listen(config, serverCommandConfig, callback) {
	var app = express.createServer();
	app.configure(function(){
		app.use(express.bodyParser());
		app.use(middleware.restify(config));
	});
	
	var commands = cfg.getCommands(config);
	
	logger.info('Listening for javascript client at /' + config.path + '/perfectapi.js');
	app.get('/' + config.path + '/jquery.perfectapi.js', function(req, res, next) {
		logger.verbose('Sending javascript');

		var data = fs.readFileSync(path.resolve(__dirname, 'javascript_template.js'), 'utf8');
		data = data
			.replace(/perfectapi/g, config.exports || 'perfectapi')
			.replace("localhost", req.headers.host)
			.replace('/rootapipath/', req.url.replace('jquery.perfectapi.js', ''))
		
		//todo: caching
		res.send(data);
		res.end();
	});
	
	for (var i=0;i<commands.length;i++) {
		var cmd = commands[i];
		if (cmd.name!="server") {
			//we could easily do the "server" command, but it would be inadvisable to allow it
			listenForCommand(config, app, cmd.path, cmd.verb, callback);
		}
	}

	var io = require('socket.io').listen(app);
	io.set('log level', 1);
	io.set('heartbeat interval', 60);
	io.enable('browser client minification');
	io.enable('browser client etag');
	io.sockets.on('connection', function (socket) {
		
		socket.on('callbackPlease', function(uuid){
			//tell the responder about the socket and the uuid
			responder.callbackPlease(socket, uuid);
		});

	});
	
	app.listen(serverCommandConfig.options.port);
	logger.info('Listening on port ' + serverCommandConfig.options.port);
}

function listenForCommand(apiConfig, app, path, verb, callback) {
	logger.info('listening for ' + verb + ' to ' + path);
	verb = 'all';  //just listen for anything, JSONP does not do POST.
	app[verb.toLowerCase()](path, function(req, res) {
		if (!req.perfectapi) {
			logger.warn('bad request');
			res.contentType('text/html');
			res.end('Recieved request to ' + path + ', but was not in correct format - needs Content-Type=application/json');
			return;
		}
		var config = req.perfectapi.config;
		var commandName = req.perfectapi.commandName;
		
		logger.verbose('Received command ' + commandName);
		
		if (commandName == 'config') {
			//special case - send config to the client
			res.contentType('application/json');
			res.end(JSON.stringify(apiConfig));
		} else {
			responder.respond(callback, commandName, config, req, res)
		}
	});
}
