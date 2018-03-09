'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const punycode = require('punycode');
let sitesCache = {
    time: 0,
    sites: []
};
let globalContext;
const cacheJsonPath = vscode.workspace.rootPath + '/.vscode/.ansible-site';
// const ftpConfigPath = getConfigPath('ftp-simple.json');

// function getConfigPath(filename){
//     var folder = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.platform == 'linux' ? process.HOMEPATH + '/.config' : '/var/local');
//     if(/^[A-Z]\:[/\\]/.test(folder)) folder = folder.substring(0, 1).toLowerCase() + folder.substring(1);
//     return normalize([folder, "/Code/User/", filename ? filename : ""].join('/'));
// }

// function normalize(p){
//     return path.normalize(p).replace(/\\/g, '/');
// };

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    //console.log('ansible-server-sites start')
    let subscriptions = [];
    globalContext = context;

    subscriptions.push(vscode.commands.registerCommand('ansible-server-sites.site-ssh', commandSiteSSH));
    subscriptions.push(vscode.commands.registerCommand('ansible-server-sites.site-clone', commandGitClone));
    subscriptions.push(vscode.commands.registerCommand('ansible-server-sites.site-configs', commandSiteConfigs));

    for(let i=0; i<subscriptions.length; i++){
        context.subscriptions.push(subscriptions[i]);
    }
}
exports.activate = activate;

async function commandSiteSSH(){
    let sites = await getSites();
    let site = await selectSite(sites);
    //console.log('site for SSH after selectSite: ', site);
    let domain = site.domain;
    let terminal = vscode.window.createTerminal(domain);
    //console.log('Executing: ', site.ssh_command);
    terminal.sendText(site.ssh_command);
    terminal.show();
}

async function commandGitClone(){
    let sites = await getSites();
    let site = await selectSite(sites);

    //console.log('site after selectSite: ', site);
    //console.log(site.git_clone_url);

    let url = await vscode.window.showInputBox({
        value: site.git_clone_url,
        prompt: "Repository URL",
        ignoreFocusOut: true
    });

    const config = vscode.workspace.getConfiguration('git');
    const value = config.get('defaultCloneDirectory') || process.HOMEPATH;
    const parentPath = await vscode.window.showInputBox({
        prompt: "Parent Directory",
        value,
        ignoreFocusOut: true
    });
    let name = path.basename(site.site_root)
    let clone_path = parentPath + path.sep + name;
    clone_path = clone_path.split('\\').join('/');
    //console.log('clone_path', clone_path);

    // Open project in new window
    if(fs.existsSync(clone_path)){
        vscode.window.showInformationMessage(name + ' exists at ' + parentPath + ', opening in new window');
        let uri = vscode.Uri.parse('file:///' + clone_path);
        vscode.commands.executeCommand('vscode.openFolder', uri, true);
        return false;
    }

    // clone terminal command
    let terminal = vscode.window.createTerminal();
    let sshCommand = 'git clone ' + url + ' ' + clone_path;
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
    let sites = await getSites();
    let site = await selectSite(sites);
    if(vscode.workspace.rootPath){
        try{
            fs.writeFileSync(cacheJsonPath, JSON.stringify(site, null, '\t'));
        } catch(err){
            vscode.window.showErrorMessage('Unable to write to ' + cacheJsonPath);
        }
    }

    //console.log('site: ', site);

    if(!site){
        return false;
    }

    //console.log('matched one site');
    let sftpData = {
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

    let debugData = {
        "name": "Listen for XDebug",
        "type": "php",
        "request": "launch",
        "port": 9000,
        "serverSourceRoot": site.site_root,
        "localSourceRoot": "${workspaceRoot}"
    };

    let winscpConfig = '[Sessions\\' + site.domain + ']\n' +
    'HostName=' + site.domain + '\n' +
    'UserName=' + site.user + '\n' +
    'LocalDirectory=C:\n' +
    'RemoteDirectory=' + site.site_root;

    //sftpConfig.push(sftpData);
    //console.log(sftpConfig);
    let doc = await vscode.workspace.openTextDocument(vscode.Uri.file('project-config.md').with({ scheme: 'untitled' }));
    let msg = '# Insert to your `ftp-simple.json`:\n\n' + '``` json\n,' + JSON.stringify(sftpData, null, '\t') + '\n```';
    msg = msg + '\n\n # Insert to your `configurations` of `launch.json`:\n\n' + '``` json\n' + JSON.stringify(debugData, null, '\t') + '\n```';
    if(process.platform == 'win32'){
        msg = msg + '\n\n # Insert to your `WinSCP.ini`:\n\n' + '``` ini\n' + winscpConfig + '\n```';
    }
    vscode.window.showTextDocument(doc);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(0, 0), msg);
    vscode.workspace.applyEdit(edit);

    // ftp-simple.json
    let answer = await vscode.window.showInformationMessage('Open ftp-simple.json?', {
        title: 'Yes',
        id: 'ansible-server-open-sftp'
    }, {
        title: 'No',
        id: 'No'
    });
    if(answer && answer.id == 'ansible-server-open-sftp'){
        //console.log('open sftp config');
        vscode.commands.executeCommand('ftp.config');
    }

    // launch.json
    answer = await vscode.window.showInformationMessage('Open launch.json?', {
        title: 'Yes',
        id: 'ansible-server-open-launch'
    }, {
        title: 'No',
        id: 'No'
    });
    if(answer && answer.id == 'ansible-server-open-launch'){
        vscode.commands.executeCommand('debug.addConfiguration');
        vscode.commands.executeCommand('workbench.action.debug.configure');
    }

    // winscp.ini
    if(process.platform == 'win32'){
        let winscpIniPath = process.env.APPDATA + '/winscp.ini';
        if(fs.existsSync(winscpIniPath)){
            answer = await vscode.window.showInformationMessage('Write winscp.ini?', {
                title: 'Yes',
                id: 'ansible-server-write-winscp'
            }, {
                title: 'No',
                id: 'No'
            });
            if(answer && answer.id == 'ansible-server-write-winscp'){
                try{
                    fs.appendFileSync(winscpIniPath, '\n\n' + winscpConfig);
                } catch(err){
                    vscode.window.showErrorMessage('Unable to write to ' + cacheJsonPath);
                }
            }
        } else {
            vscode.window.showErrorMessage('%APPDATA%\\winscp.ini not found, open Options - Preferences - Storage - set Configuration storage - Automatic INI file')
        }
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

function selectSite(sites){
    let options = sites.map(function(site){
        return {
            label: punycode.toUnicode(site.domain),
            description: site.host + (site.group ? ' / ' + site.group : ''),
        };
    });

    let promise = new Promise((resolve, reject) => {
        if(vscode.workspace.rootPath && fs.existsSync(cacheJsonPath)){
            let jsonRaw = fs.readFileSync(cacheJsonPath).toString();
            let site = JSON.parse(jsonRaw);
            resolve(site);
            return;
        }

        let p = vscode.window.showQuickPick(options, {placeHolder:'domain'});
        p.then(function(val){
            //console.log('selected: ', val);
            if(val === undefined){
                return 'Nothing selected';
            }

            let ind = options.indexOf(val);
            let site = sites[ind];
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
    const config = vscode.workspace.getConfiguration('ansible-server-sites');
    const cacheTime = config.get('json_cache_time', 300);
    return new Promise((resolve, reject) => {
        // cache
        if(sitesCache.sites.length > 0){
            let cacheAgeSeconds = (new Date().getTime() - sitesCache.time.getTime()) / 1000;
            // console.log('cache age: ' + cacheAgeSeconds);
            if(cacheAgeSeconds < cacheTime){
                // console.log('resolve sites from runtime cache');
                resolve(sitesCache.sites);
                return;
            }
        }

        // fetch
        // console.log('resolve sites from url...')
        const url = config.get('json_url');
        fetch(url)
            .then(response => {
                if(response.status != 200){
                    throw new Error('Failed to fetch ' + url + ', status ' + response.status);
                }
                return response.json();
            })
            .then(json => {
                sitesCache.sites = json.sites;
                sitesCache.time = new Date()
                // console.log('store global cache');
                resolve(sitesCache.sites);
            })
            .catch(err => console.error(err));
    });
}
