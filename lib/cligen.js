var winston = require('winston');

if (typeof process.env['NODE_ENV'] == 'undefined' 
  || process.env['NODE_ENV'] == '' 
  || process.env['NODE_ENV'] == 'development') {
  winston.loggers.add('perfectapi', {
    console: {
      level: 'info',
      colorize: 'true'
    }
  });
} else {
  winston.loggers.add('perfectapi', {
    console: {
      level: 'warn',
      colorize: 'true'
    }
  });
}

var logger = winston.loggers.get('perfectapi');

var fs = require('fs');
var path = require('path');
var program = require('./commander.js');
var util = require('util');
var events = require('events');
var cfg = require('./config.js');

//I don't understand really, but following example from 
//  http://elegantcode.com/2011/02/21/taking-baby-steps-with-node-js-implementing-events/
function Parser() {
  if(false === (this instanceof Parser)) {
    return new Parser();
  }

  events.EventEmitter.call(this);
}
util.inherits(Parser, events.EventEmitter);

/*
  parses the command line and raises an event when a command is called:
    - @eventName = name of the command that was requested
	- @configPath = path to the perfectapi.json file that specifies the commands and options
	- @callback = function to call once command has been completed
*/

var fork = require('child_process').fork;

Parser.prototype.parse = function(configPath) {
	var self = this;	
	var rawConfig = cfg.getConfigFromPath(configPath);
	var commands = cfg.getCommands(rawConfig);

  //handling for special reserved commands
  self.on('server', function(serverConfig, callback) {
    //HACK: always run in-process for now.  Node process.send() blocks, making it unusable for high throughput IPC.
    if ((serverConfig.options.webworker == 'false' || serverConfig.options.webworker == false) 
      || (serverConfig.options.webworker == 'auto' && require('os').cpus().length == 1)) {

      runWebServerInProcess(rawConfig, serverConfig, self);
      callback();
    } else {
      runWebServerAsWorker(rawConfig, serverConfig, self, callback);
    }
  })
  self.on('config', function(config, callback) {
    console.log(JSON.stringify(rawConfig, null, 2));
  })
  self.on('install', function(config, callback) {
    if (require('os').platform()=='win32') {
      logger.info('Windows install requested');
      require('./installwin32.js').install(config)
    } else {
      logger.info('Linux install requested');
      require('./installlinux.js').install(config);
    }
  })
  self.on('uninstall', function(config, callback) {
    if (require('os').platform()=='win32') {
      logger.info('Windows uninstall requested');
      require('./installwin32.js').uninstall(config)
    } else {
      logger.info('Linux uninstall requested');
      require('./installlinux.js').uninstall(config);
    }
  })

  if (runningFromCommandLine()) {
    //setup parsing of command-line for each command
    commands.forEach(function(commandSpec) {
      setupCommandLineParsingOfCommand(program, commandSpec, rawConfig, self)
    })

    //handle unrecognized commands
    program.on('*', function(name) {
      console.log('Unrecognized command "' + name + '"');
      console.log(program.helpInformation().replace('[undefined]', ''));
    });

    //do the parse
    program.parse(process.argv);
    if (process.argv.length == 2) return console.log(program.helpInformation());
  }

  //export the API to other Node.js modules
	return initNativeAPI(rawConfig, self);	
}

exports.Parser = Parser;

/**
* Runs the web server in the same process as the user's code.  This is quicker for a single 
* cpu, but risks the user's code stealing cpu and preventing the web server from serving 
* responses in a timely fashion
*/
function runWebServerInProcess(rawConfig, serverConfig, emitter) {
  var server = require('./server.js');
  
  if (serverConfig.command == 'stop') {
    logger.info('stopping server');
    return server.stop();
  }
  
  var app = server.listen(rawConfig, serverConfig, function(err, newCommandName, newConfig, finalCallback) {
    if (err) { 
      logger.error("Error: " + err);
      if (callback) callback(err);
    } else {
      emitter.emit(newCommandName, newConfig, finalCallback);
    }
  });
}

var webservers = [];   //array or webserver workers
var netServer;
/**
* Runs the web server in a forked process.  This is not necessarily quicker, but it does allow the 
* user's code to hog CPU without affecting the running of the web server
*/
function runWebServerAsWorker(rawConfig, serverConfig, emitter, callback) {
  if (serverConfig.command == 'stop') {
    logger.info('stopping server workers');
    if (netServer) {
      netServer.close();
      netServer = null;
    }    
    
    for (var i=0;i<webservers.length;i++) {
      var webserver = webservers[i];
      webserver.kill();    
    }
    webservers = [];
    
    return;
  }
  
  netServer = require('net').createServer().listen(serverConfig.options.port, function() {
    var numWorkers = require('os').cpus().length;
    var readyCount = 0;
    for (var i=0;i<numWorkers;i++) {
      var webserver = fork(__dirname + '/worker.js', [], {env: process.env});
      webservers.push(webserver);
      webserver.send({message: 'start', rawConfig: rawConfig, serverConfig: serverConfig}, netServer._handle)
      
      webserver.on('message', function(m) {
        if (m == 'ready') {
          //this is a reply from the worker indicating that the server is ready.
          readyCount += 1;
          if (readyCount == numWorkers) {
            //all servers are ready
            logger.info('started server workers');
            if (callback) callback();
          }
          return;
        }
        
        var webserverWorker = this;
        var id = m.id;
        if (m.err) { 
          logger.error("Error: " + m.err);
          if (callback) callback(m.err);
        } else {
          emitter.emit(m.commandName, m.config, function(err, result) {
            webserverWorker.send({message: 'result', err: err, result: result, id: id})
          });
        }
      })
    }
    
    
  });
}

function runningFromCommandLine() {
  //http://nodejs.org/docs/latest/api/all.html#accessing_the_main_module
  //require.main = user's code (foo.js), if run via 'node foo.js', or another module if run from there
  //parent 1 = api.js (from PerfectAPI)
  //parent 2 = user's code, e.g. foo.js
  
  return(require.main === module.parent.parent);
}

function setupCommandLineParsingOfCommand(program, commandSpec, rawConfig, emitter) {
  var name = commandSpec.name;
  commandSpec.parameters.forEach(function(param) {
    var multi = (param.type=='multi') ? '..' : '';
    if (param.required) {
      name += ' <' + param.name + multi + '>';
    } else {
      name += ' [' + param.name + multi + ']';
    }
  })  
  
  var cmd = program
    .command(name)
    .description(commandSpec.synopsis)
    .action(function() {
      //handle the command-line.  Arguments are param1, param2, full commander.js options object
      var options = arguments[arguments.length-1];   //full commander.js options object
      var commandName = options.name;
      var commandSpec = cfg.getCommandByName(rawConfig, commandName);

      var finalConfig = cfg.getDefaultConfig(rawConfig, commandName);
      
      var args = arguments;
      commandSpec.parameters.forEach(function(param, index) {
        finalConfig[param.name] = args[index.toString()]
      })
      
      finalConfig.options = cfg.merge(finalConfig.options, options);	//merge the parsed options into the standard perfectAPI options
      
      var fun = getCommandFunction(rawConfig, commandName, emitter);
      
      //this is where we actually call the code
      fun(finalConfig, function(err, result) {
        if (err) {
          logger.error(err);
        } else {
          console.log(result);
        }
      })
    });
  
  //setup commander.js options for this command:
  var options = commandSpec.options || [];
  for (var j=0;j<options.length;j++) {
    var option = options[j];
    if (option.option) {
      var optionText = '';
      if (option.short)
        optionText = '-' + option.short + ', ';
      optionText += '--' + (option.long || option.option);
      if (option.required)
        optionText += ' <' + option.option + '>'
      else
        optionText += ' [' + option.option + ']';
      
      if (option.default) 
        cmd.option(optionText, option.description, option.default);
      else
        cmd.option(optionText, option.description);
    } else if (option.flag) {
      
      var optionText = ''
      if (option.short) {
        optionText = '-' + option.short + ', --' + option.long;
      } else {
        optionText = '--' + option.long;
      }
      
      cmd.option(optionText, option.description);
    }
  }
}

function initNativeAPI(rawConfig, emitter) {
	//expose functions for each command
	//function commandName(config, callback)
	var commands = cfg.getCommands(rawConfig);
	var api = {}
	
	for(var i=0;i<commands.length;i++) {
		var cmd = commands[i];
		
		var commandFunction = getCommandFunction(rawConfig, cmd.name, emitter)
		
		api[cmd.name] = commandFunction;
	}
	
	return api;
};

function getCommandFunction(rawConfig, commandName, emitter) {
	var commandFunction = function(config, callback) {
  
    logger.verbose('handling command ' + commandName);
    //stub callback to ensure we always return an Error object
    var cb = function(err, result) {
      if (err && !util.isError(err)) {
        err = new Error(err);
      }
      if (callback) callback(err, result);
    }
    
		var finalConfig = cfg.getDefaultConfig(rawConfig, commandName);
    var commandSpec = cfg.getCommandByName(rawConfig, commandName);
    
    commandSpec.parameters.forEach(function(param, index) {
      finalConfig[param.name] = config[param.name];
    }) 
		finalConfig.options = cfg.merge(finalConfig.options, config.options);	//merge the parsed options into the standard perfectAPI options
    finalConfig.environment = cfg.merge(finalConfig.environment, config.environment);
    
    commandSpec.parameters.forEach(function(param) {
      //handle file parameter
      if (param.type 
      && param.type === 'file'
      && finalConfig[param.name] != '') {
      
        var fileName = finalConfig[param.name];
        logger.info('Reading file ' + fileName);
        finalConfig[param.name] = getFile(fileName);
        if (param.required && finalConfig[param.name] === '') {
          return cb('File ' + fileName + ' not found');
        }
      }    
    })

    
    if (commandSpec.options) {
      commandSpec.options.forEach(function(option) {
        if (option.type 
        && option.type === 'file' 
        && finalConfig.options[option.option] != '') {
        
          var fileName = finalConfig.options[option.option];
          logger.info('Reading file ' + fileName);
          finalConfig.options[option.option] = getFile(fileName);
          if (option.required && finalConfig.options[option.option] === '') {
            return cb('File ' + fileName + ' not found');
          }
        }
      })
    }
    
    //emit event with config and callback
		emitter.emit(commandName, finalConfig, cb);
	}
	
	return commandFunction;
}

function getFile(fileName) {
  if (fs.existsSync(fileName)) {
    return fs.readFileSync(fileName).toString('base64');
  } else {
    return '';
  }
  
}
