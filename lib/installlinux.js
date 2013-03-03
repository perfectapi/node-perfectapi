var path=require('path');
var fs = require('fs');
var logger = require('winston').loggers.get('perfectapi');
var exec = require('child_process').exec;
var cfg = require('./config.js');

exports.install = function(config) {

	/* substitutions that should occur before running:
	 *
	 *  afwqrdsf234234 = node_modules/amigen/ - root path of module, where files are currently
	 *  asdas7867652 = /lib/amigen/bin/amigen.js - final path of bin file
	 *  876uyghjhsadadsf = amigen - name of service
	 *  u7a6ajshgdjbhdasf = 3001 - port number
	 * 	7i6jhgjasdsadassda = EnvVarSets - exports for environment variables
	*/

	//collect relavant environment variables
	var environment = "export NODE_ENV=production";
	var sep = "\n\t";
	if (config.environment) {
		for (var env in config.environment) {
			if (process.env[env]) {
				environment = environment + sep + 'export ' + env + '=' + process.env[env];
			}
		}	
	}

	//get paths
	var runningModule = getRunningModule();		//this is what we want the service to execute (after we copy it)
	var runningPath = path.dirname(runningModule);
	var rootPath = getPathToPackageJson(runningPath);
	if (rootPath == '') return logger.error('Failed to find package path, started looking in ' + runningPath);
	var relativeBin = runningPath.replace(rootPath, '');
	var binName = runningModule.replace(runningPath, '');
	
	//read template and replace stuff
	var installScript = path.resolve(__dirname, 'installer', 'install_template.sh');
	var installScriptContent = fs.readFileSync(installScript, 'utf8');
	installScriptContent = installScriptContent
		.replace(/afwqrdsf234234/g, rootPath + '/')
		.replace(/asdas7867652/g, '/lib/' + config.name + relativeBin + binName)		//somehow the slashes all work out
		.replace(/876uyghjhsadadsf/g, config.name)
		.replace(/u7a6ajshgdjbhdasf/g, config.options.port)
		.replace(/7i6jhgjasdsadassda/g, environment);
	
	
  var tempDir = process.env['TMPDIR'] || '/tmp';
	var newInstallScript = path.resolve(tempDir, 'perfectapiInstall_' + config.name + '.sh');
	fs.writeFileSync(newInstallScript, installScriptContent, 'utf8');
	fs.chmodSync(newInstallScript, '755');
	
	//do the install 
	var installer = exec('sudo ' + newInstallScript, function (err, stdout, stderr) {	
		if (stderr) {
			logger.error(stderr);
			logger.verbose(stdout)
		}

		if (err) {
			logger.error('exec error: ' + err);
			return;
		}		
    
		console.log('Successfully installed ' + config.name);
		console.log('Use status, start, stop, restart commands to control, e.g. sudo status ' + config.name);
		console.log('You can see the new service\'s log in /var/log/' + config.name + '.log' );
	});
	
};

exports.uninstall = function(config) {
	//read template and replace stuff
	var uninstallScript = path.resolve(__dirname, 'installer', 'uninstall_template.sh');
	var uninstallScriptContent = fs.readFileSync(uninstallScript, 'utf8');
	uninstallScriptContent = uninstallScriptContent
		.replace(/876uyghjhsadadsf/g, config.name);
		
  var tempDir = process.env['TMPDIR'] || '/tmp';
	var newunInstallScript = path.resolve(tempDir, 'perfectapiUninstall_' + config.name + '.sh');
	fs.writeFileSync(newunInstallScript, uninstallScriptContent, 'utf8');
	fs.chmodSync(newunInstallScript, '755');
	
	//do the uninstall
	var uninstaller = exec('sudo ' + newunInstallScript, function (err, stdout, stderr) {	
		if (stderr) {
			logger.error(stderr);
			logger.verbose(stdout)
		}

		if (err) {
			logger.error('exec error: ' + err);
			return;
		}
		
		console.log('Successfully uninstalled ' + config.name);
	});
};

function getRunningModule() {
	var currentModule = module;
	while (currentModule.parent)
		currentModule = currentModule.parent;
		
	return currentModule.filename;
}

function getPathToPackageJson(runningPath) {
	var currentPath = runningPath;
	while (!fs.existsSync(path.resolve(currentPath, 'package.json'))) {
		var newPath = path.resolve(currentPath, '..');
		if (newPath == currentPath) {
			return '';   //something balked
		} else {
			currentPath = newPath;  //continue looking
		}
	}
	
	return currentPath;
}