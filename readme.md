Package Goal
------------
The goals of this package are to support:

 - Well-designed APIs (easy to use, scales well, easy to extend, etc)
 - Simple usage of any API from any programming language.  (Its pretty easy already, but we make it even easier)
 - Full support for running an API as a service on Linux and Windows operating systems
 - Simplicity of development for both API authors and consumers
 

Reasons to use PerfectAPI (Current Feature list)
-------------------------

 - You want to expose an API using Node.js, or you want to make an existing Node.js module accessible as a remote service API
 - You care about performance - [4 times faster than node-restify](http://blog.perfectapi.com/2012/benchmarking-apis-using-perfectapi-vs-express.js-vs-restify.js/)
 - Easily create a self-hosted server with command-line - `myapp server -p 3002`
 - Support for easy configuration via environment variables
 - Awesomely amazing test page for your users to learn/experiment/test your API, e.g. [amigen api test page](http://services.perfectapi.com/amigen/testapp/)
 - Windows and Linux installers (run your API as a true service on your server) - `myapp install myappservicename`
 - Automatic validation of required parameters (no need to code boring validation)
 - Local command-line access to your API
 - Built-in JSONP interface to your API - that means you can access it using JavaScript from another domain
 - REST-like interface to your API
 - Native .NET client to your API - access from .NET without dealing with REST, JSON, WebRequest etc.
 - Built-in support for max-age and etag server caching - lowers your costs by doing less work
 
Is it Perfect?
--------------

No.  See the [FAQ](https://github.com/perfectapi/node-perfectapi/wiki/FAQ)

Install
-------
The usual for Node.js stuff

    $ npm install perfectapi

or for a global install:

    $ sudo npm install -g perfectapi

How to include in your API
--------------------------
First, create a `perfectapi.json` configuration file.  See [Configuration File](node-perfectapi/wiki/perfectapi-config-file-format) for details.   Once you have a configuration file, a sample usage is:

```
#!/usr/bin/env node

var perfectapi = require('perfectapi');  
var path = require('path');

var configPath = path.resolve(__dirname, 'perfectapi.json');
var parser = new perfectapi.Parser();

//handle the commands
parser.on("mycommand", function(config, callback) {
	//do mycommand code, putting results into "result" object

	//after done
	callback(err, result);
});
 
parser.on("anothercommand", function(config, callback) {
	//do anothercommand code, putting results into "result" object

	//after done
	callback(err, result);
});

//expose the api
module.exports = parser.parse(configPath);
```

In your `package.json` file, be sure to specify the above file as a "bin", so that the app can be called from the command-line, e.g.

```	
{ "name": "myNodeLib"
, "version": "0.0.1"
, "description": "My brilliant API"
, "main": "./bin/myNodeLib.js"
, "bin": "./bin/myNodeLib.js"
, "engines": {
    "node" : ">=0.6.5"
  }
, "dependencies": {
	"perfectapi": ">=0.0.13"
  }
}
```
Thats it.  

See [the website](http://perfectapi.github.com/node-perfectapi) and [wiki](http://github.com/perfectapi/node-perfectapi/wiki) for more info.
