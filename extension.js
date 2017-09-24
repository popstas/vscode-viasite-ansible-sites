'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var fetch = require('fetch-everywhere');
var fs = require('fs');
var path = require('path');
var os = require('os');
var punycode = require('punycode');
var sites = [];
var terminals = [];
var homeDir = os.homedir();
var globalContext;
var cacheJsonPath = vscode.workspace.rootPath + '/.vscode/.ansible-site';
// const ftpConfigPath = getConfigPath('ftp-simple.json');

// function getConfigPath(filename){
//     var folder = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.platform == 'linux' ? homeDir + '/.config' : '/var/local');
//     if(/^[A-Z]\:[/\\]/.test(folder)) folder = folder.substring(0, 1).toLowerCase() + folder.substring(1);
//     return normalize([folder, "/Code/User/", filename ? filename : ""].join('/'));
// }

// function normalize(p){
//     return path.normalize(p).replace(/\\/g, '/');
// };

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    console.log('ansible-server-sites start')
    var subscriptions = [];
    globalContext = context;

    subscriptions.push(vscode.commands.registerCommand('ansible-server-sites.site-ssh', commandSiteSSH));
    subscriptions.push(vscode.commands.registerCommand('ansible-server-sites.site-clone', commandGitClone));
    subscriptions.push(vscode.commands.registerCommand('ansible-server-sites.site-configs', commandSiteConfigs));

    for(var i=0; i<subscriptions.length; i++){
        context.subscriptions.push(subscriptions[i]);
    }

    getSites();
}
exports.activate = activate;

async function commandSiteSSH(){
    var sites = await getSites();
    var site = await selectSite();
    console.log('site for SSH after selectSite: ', site);
    domain = site.domain;
    var terminal = terminals.find(function (element, index, array) { return element.name == this }, domain);
    if (terminal === undefined) { // If the terminal does not exist
        terminal = vscode.window.createTerminal(domain);
        terminals.push({ "name": domain, "terminal": terminal });
        sshCommand = site.ssh_command;
        console.log('Executing: ', sshCommand);
        terminal.sendText(sshCommand);
    }
    else {
        terminal = terminal.terminal;
    }
    terminal.show();
}

async function commandGitClone(){
    var sites = await getSites();
    var site = await selectSite();

    console.log('site after selectSite: ', site);
    console.log(site.git_clone_url);

    var url = await vscode.window.showInputBox({
        value: site.git_clone_url,
        prompt: "Repository URL",
        ignoreFocusOut: true
    });

    const config = vscode.workspace.getConfiguration('git');
    const value = config.get('defaultCloneDirectory') || os.homedir();
    const parentPath = await vscode.window.showInputBox({
        prompt: "Parent Directory",
        value,
        ignoreFocusOut: true
    });
    var name = path.basename(site.site_root)
    var clone_path = parentPath + path.sep + name;
    clone_path = clone_path.split('\\').join('/');
    console.log('clone_path', clone_path);

    // Open project in new window
    if(fs.existsSync(clone_path)){
        vscode.window.showInformationMessage(name + ' exists at ' + parentPath + ', opening in new window');
        var uri = vscode.Uri.parse('file:///' + clone_path);
        vscode.commands.executeCommand('vscode.openFolder', uri, true);
        return false;
    }

    // clone terminal command
    terminal = vscode.window.createTerminal();
    sshCommand = 'git clone ' + url + ' ' + clone_path;
    terminal.sendText(sshCommand);
    terminal.show();

    // this.git.clone(url, parentPath);

    // try {
    //     vscode.window.withProgress({ location: ProgressLocation.SourceControl, title: "Cloning git repository..." }, () => clonePromise);
    //     vscode.window.withProgress({ location: ProgressLocation.Window, title: "Cloning git repository..." }, () => clonePromise);

    //     const repositoryPath = clonePromise;

    //     const open = "Open Repository";
    //     const result = vscode.window.showInformationMessage("Would you like to open the cloned repository?", open);

    //     const openFolder = result === open;
    //     if (openFolder) {
    //         commands.executeCommand('vscode.openFolder', Uri.file(repositoryPath));
    //     }
    // } catch (err) {
    //     throw err;
    // }
}

async function commandSiteConfigs(){
    //sftpConfig = loadSimpleFtpConfig();
    //console.log(sftpConfig);

    var site;
    var sites = await getSites();
    var site = await selectSite();
    if(vscode.workspace.rootPath){
        fs.writeFileSync(cacheJsonPath, JSON.stringify(site, null, '\t'));
    }

    siteDomain = site.domain;
    //var site = sites[0];
    console.log('site: ', site);

    if(!site){
        return false;
    }

    // var sitesMatches = [];
    // sftpConfig.forEach(function(element) {
    //     if(element.name == siteDomain){
    //         console.log('Found config for site');
    //         sitesMatches.push(element);
    //         return element;
    //     }
    // }, this);

    console.log('matched one site');
    var sftpData = {
        "name": site.domain,
        "host": site.domain,
        "port": 22,
        "type": "sftp",
        "username": site.user,
        "password": "asd",
        "path": "/",
        "agent": "pageant",
        "autosave": true,
        "confirm": true,
        "project": {}
    };
    sftpData.project[vscode.workspace.rootPath] = site.site_root;

    debugData = {
        "name": "Listen for XDebug",
        "type": "php",
        "request": "launch",
        "port": 9000,
        "serverSourceRoot": site.site_root,
        "localSourceRoot": "${workspaceRoot}"
    };

    //sftpConfig.push(sftpData);
    //console.log(sftpConfig);
    var doc = await vscode.workspace.openTextDocument(vscode.Uri.file('project-config.md').with({ scheme: 'untitled' }));
    var msg = '# Insert to your `ftp-simple.json`:\n\n' + '``` json\n,' + JSON.stringify(sftpData, null, '\t') + '\n```';
    msg = msg + '\n\n # Insert to your `configurations` of `launch.json`:\n\n' + '``` json\n,' + JSON.stringify(debugData, null, '\t') + '\n```';
    vscode.window.showTextDocument(doc);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(0, 0), msg);
    vscode.workspace.applyEdit(edit);

    var answer = await vscode.window.showInformationMessage('Open stp-simple.json?', {
        title: 'Yes',
        id: 'ansible-server-open-sftp'
    }, {
        title: 'No',
        id: 'No'
    });

    if(answer && answer.id == 'ansible-server-open-sftp'){
        console.log('open sftp config');
        vscode.commands.executeCommand('ftp.config');
    }

    answer = await vscode.window.showInformationMessage('Open launch.json?', {
        title: 'Yes',
        id: 'ansible-server-open-launch'
    }, {
        title: 'No',
        id: 'No'
    });
    console.log(answer);
    if(answer && answer.id == 'ansible-server-open-launch'){
        vscode.commands.executeCommand('debug.addConfiguration');
        vscode.commands.executeCommand('workbench.action.debug.configure');
    }
}

// function loadSimpleFtpConfig(){
//     console.log('loadSimpleFtpConfig');
//     console.log(ftpConfigPath);
//     jsonRaw = fs.readFileSync(ftpConfigPath).toString();
//     console.log(jsonRaw);
//     json = JSON.parse(jsonRaw);
//     return json;
// }

// function saveSimpleFtpConfig(configData){
//     jsonRaw = JSON.stringify(configData, null, '\t');
//     console.log('save json:', jsonRaw);
//     //fs.writeFileSync(ftpConfigPath, cryptoUtil.encrypt(jsonRaw));
//     jsonRaw = fs.writeFileSync(ftpConfigPath, jsonRaw);
// }

function selectSite(){
    var options = sites.map(function(site){
        return {
            label: punycode.toUnicode(site.domain),
            description: site.host + (site.group ? ' / ' + site.group : ''),
        };
    });

    var promise = new Promise((resolve, reject) => {
        if(vscode.workspace.rootPath && fs.existsSync(cacheJsonPath)){
            var jsonRaw = fs.readFileSync(cacheJsonPath).toString();
            site = JSON.parse(jsonRaw);
            resolve(site);
            return;
        }

        var p = vscode.window.showQuickPick(options, {placeHolder:'domain'});
        p.then(function(val){
            console.log('selected: ', val);
            if(val == undefined){
                return 'Nothing selected';
            }

            var ind = options.indexOf(val);
            var site = sites[ind];
            resolve(site);
        });
    });
    return promise;
}

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;

function getSites(){
    var cached = []; //globalContext.globalState.get('ansible-server-sites') || [];    
    var promise = new Promise((resolve, reject) => {
        if(sites.length > 0){
            console.log('resolve sites from runtime cache');
            resolve(sites);
        } else if(cached && cached.length > 0) {
            sites = cached;
            console.log('resolve sites from globalState', cached);
            resolve(sites);
        } else {
            console.log('resolve sites from url...')
            const config = vscode.workspace.getConfiguration('ansible-server-sites');
            const url = config.get('json_url');
            return fetch(url).then((response) => {
                return response.json()
            }).then((json) => {
                sites = json.sites;
                globalContext.globalState.update('ansible-server-sites', sites);
                console.log('store global cache');
                resolve(sites);
            });
        }
    });
    return promise;
}

function initExtension(){
    console.log('ansible-server-sites initExtenstion()');
}