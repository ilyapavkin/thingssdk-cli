#!/usr/bin/env node
'use strict';

const path = require("path");
const fs = require("fs");
const inquirer = require("inquirer");
const serialport = require("serialport");
const mkdirp = require("mkdirp");
const cliPackage = require("../package.json");
const exec = require("child_process").exec;
const readLine = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});
const colors = require("colors");
colors.setTheme({
    info: "green",
    help: "cyan",
    warn: "yellow",
    debug: "blue",
    error: "red"
});

const argv = require("yargs")
    .version(cliPackage.version)
    .command(require("./commands/new"))
    .demand(1)
    .help()
    .argv;

const RUNTIMES = {
    espruino: "1.86"
};

const NO_SUCH_FILE_OR_DIRECTORY_ERROR_CODE = 'ENOENT';

function isDirectoryEmpty(path, callback) {
    fs.readdir(path, (err, files) => {
        if (err && err.code !== NO_SUCH_FILE_OR_DIRECTORY_ERROR_CODE) {
            throw err;
        } else {
            const noFilesPresent = !files || !files.length;
            callback(noFilesPresent);
        }
    });
}

function createApplication(destinationPath) {
    isDirectoryEmpty(destinationPath, (isEmpty) => {
        if (isEmpty) {
            createFiles(destinationPath, applicationFinished(destinationPath));
        } else if (!isEmpty) {
            readLine.question(`Files already exist at ${destinationPath}.
Would you like to overwrite the existing files?
Type y or n: `, (answer) => {
                switch (answer.toLowerCase().trim()) {
                    case ("y" || "yes"):
                        console.log(colors.info("You answered yes. Overwriting existing project files."));
                        readLine.close();
                        createFiles(destinationPath, applicationFinished(destinationPath));
                        break;
                    case ("n" || "no"):
                        console.log(colors.warn("No project files were changed. Aborting new project creation."));
                        readLine.close();
                        process.exit(1);
                        break;
                    default:
                        console.error(colors.error("I don't understand your input. No project files were changed. Aborting new project creation."));
                        readLine.close();
                        process.exit(1);
                }
            });
        }
    });
}

function applicationFinished(destinationPath) {
    return (err) => {
        if (err) throw err;
        console.log(colors.help(`To install the project dependencies:
    cd ${destinationPath} && npm install
To upload to your device:
    cd ${destinationPath} && npm run push`));
        process.exit(0);
    };
}

function createFiles(destinationPath, done) {
    const app_name = path.basename(path.resolve(destinationPath));
    mkdirp(destinationPath + "/scripts", (err) => {

        /* Copy templates */
        const templatesPath = path.join(__dirname, "..", "templates");
        const scriptPath = path.join(templatesPath, argv.runtime, "scripts");
        fs.readdir(scriptPath, (err, files) => {
            if (err) return done(err);
            files.forEach(file => copy(path.join(scriptPath, file), path.join(destinationPath, "scripts", file)));
        });

        /* Create package.json for project */
        const pkg = createPackageJSON(app_name);
        write(path.join(destinationPath,"package.json"), JSON.stringify(pkg, null, 2));
        copy(path.join(templatesPath, 'main.js'), path.join(destinationPath, 'main.js'));
        copy(path.join(templatesPath, 'dot-gitignore'), path.join(destinationPath, '.gitignore'));
        /* Create devices.json and finish */
        createDevicesJSON().then((devices) => {
            write(path.join(destinationPath,"devices.json"), JSON.stringify(devices, null, 2));
            done();
        }).catch((error) => console.error(error));
    });
}

function copy(from, to) {
    write(to, fs.readFileSync(from));
}

function write(path, contents) {
    fs.writeFileSync(path, contents);
}

function createPackageJSON(app_name) {
    const pkg = {
        name: app_name,
        version: '0.0.0',
        private: true,
        main: 'main.js',
        scripts: {
            push: "node ./scripts/push"
        },
        devDependencies: {
            "thingssdk-deployer": "github:thingssdk/thingssdk-deployer",
            "thingssdk-espruino-strategy": "github:thingssdk/thingssdk-espruino-strategy"
        },
        engines: {

        }
    };

    pkg.engines[argv.runtime] = RUNTIMES[argv.runtime];

    return pkg;
}

function getPorts() {
    return new Promise(
        (resolve, reject) => {
            serialport.list(
                (err, ports) => {
                    if (err) reject(err);
                    resolve(ports.map((port) => port.comName));
                });
        });
}

function createDevicesJSON() {
    return new Promise((resolve, reject) => {
        getPorts().then((ports) => {
            let questions = [
                {
                    type: 'list',
                    name: 'port',
                    message: 'Select a port:',
                    choices: ports,
                    default: ports[0]
                },
                {
                    type: 'list',
                    name: 'baud',
                    message: 'Select the baud rate:',
                    choices: ['9600', '115200'],
                    default: '115200'
                }
            ];

            let deviceJSON = inquirer.prompt(questions).then((answers) => {
                const port = answers.port;
                const baud = parseInt(answers.baud);

                let devices = {
                    devices: {}   
                }

                devices.devices[port] = {
                    'baud_rate': baud,
                    'runtime': argv.runtime
                }

                return devices;
            });

            resolve(deviceJSON);
        }).catch((error) => console.error(error));
    });
}

createApplication(argv.path);
