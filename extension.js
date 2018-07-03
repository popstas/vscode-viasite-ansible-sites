'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const punycode = require('punycode');
const exec = require('child_process').exec;
let sitesCache = {
  time: 0,
  sites: []
};

function activate(context) {
  const commands = {
    'site-ssh': commandSiteSSH,
    'ssh-tunnel': commandSSHTunnel,
    winscp: commandSiteWinSCP,
    'site-putty': commandSitePuTTY,
    'site-clone': commandGitClone,
    'site-configs': commandSiteConfigs
  };

  const subscriptions = Object.entries(commands).map(tuple => {
    return vscode.commands.registerCommand(
      'ansible-server-sites.' + tuple[0],
      proxySiteCommand(tuple[1])
    );
  });

  for (let i = 0; i < subscriptions.length; i++) {
    context.subscriptions.push(subscriptions[i]);
  }
}
exports.activate = activate;

// proxy site command, select site, then call command
function proxySiteCommand(command, site = null) {
  return async function() {
    // from .ansible-site file
    if (!site) {
      const cacheJsonPath = vscode.workspace.rootPath + '/.ansible-site';
      if (fs.existsSync(cacheJsonPath)) {
        const jsonRaw = fs.readFileSync(cacheJsonPath).toString();
        site = JSON.parse(jsonRaw);
      }
    }

    // from select
    if (!site) site = await getSites().then(selectSite);

    // site not defined
    if (!site) return false;
    return command(site);
  };
}

async function commandSiteSSH(site) {
  let terminal = vscode.window.createTerminal(site.domain);
  terminal.sendText(site.ssh_command);
  terminal.show();
}

async function commandSSHTunnel(site) {
  let terminal = vscode.window.createTerminal(site.domain + 'SSH tunnel');
  terminal.sendText(site.ssh_command + ' -R 9000:localhost:9000');
  terminal.show();
}

async function commandSiteWinSCP(site) {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  let winscpPath = config.get('winscp_path');
  let userHost = site.user + '@' + site.host;
  exec(`"${winscpPath}" "${userHost}`);
}

async function commandSitePuTTY(site) {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  let puttyPath = config.get('putty_path');
  let userHost = site.user + '@' + site.domain;
  exec(`START ${puttyPath} ${userHost}`);
}

async function commandGitClone(site) {
  let url = await vscode.window.showInputBox({
    value: site.git_clone_url,
    prompt: 'Repository URL',
    ignoreFocusOut: true
  });

  const config = vscode.workspace.getConfiguration('git');
  const value = config.get('defaultCloneDirectory') || process.HOMEPATH;
  const parentPath = await vscode.window.showInputBox({
    prompt: 'Parent Directory',
    value,
    ignoreFocusOut: true
  });
  let name = path.basename(site.site_root);
  let clone_path = parentPath + path.sep + name;
  clone_path = clone_path.split('\\').join('/');
  //console.log('clone_path', clone_path);

  // Open project in new window
  if (fs.existsSync(clone_path)) {
    vscode.window.showInformationMessage(
      name + ' exists at ' + parentPath + ', opening in new window'
    );
    let uri = vscode.Uri.parse('file:///' + clone_path);
    vscode.commands.executeCommand('vscode.openFolder', uri, true);
    return false;
  }

  // clone terminal command
  let terminal = vscode.window.createTerminal();
  let sshCommand = 'git clone ' + url + ' ' + clone_path;
  let openCommand = 'code ' + clone_path;
  terminal.sendText(sshCommand + ' && ' + openCommand);
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

async function commandSiteConfigs(site, projectRoot = null, yesToAll = false) {
  const settingsPath = projectRoot + '/.vscode';
  if (!fs.existsSync(settingsPath)) fs.mkdirSync(settingsPath);

  let debugData = {
    name: 'Listen for XDebug',
    type: 'php',
    request: 'launch',
    port: 9000,
    serverSourceRoot: site.site_root,
    localSourceRoot: '${workspaceRoot}'
  };

  let sessionName = site.user + '@' + site.host;

  let winscpConfig = '';
  winscpConfig += `[Sessions\\${sessionName}]\n`;
  winscpConfig += `HostName=${site.host}\n`;
  winscpConfig += `UserName=${site.user}\n`;
  winscpConfig += `LocalDirectory=C:\n`;
  winscpConfig += `RemoteDirectory=${site.site_root}`;

  let deployConfig = {
    packages: [
      {
        name: site.domain,
        deployOnSave: true,
        fastCheckOnSave: true,
        targets: ['sftp'],
        files: ['**/*']
      }
    ],
    targets: [
      {
        type: 'sftp',
        name: 'sftp',
        dir: site.site_root,
        host: site.host,
        agent: 'pageant',
        user: site.user,
        password: '...'
      }
    ]
  };

  let msg;

  // .ansible-site
  msg = 'Bind current project to ' + site.domain + '?';
  if (yesToAll || (!fs.existsSync(cacheJsonPath) && (await confirmAction(msg)))) {
    let cacheJsonPath = settingsPath + '/.ansible-site';
    try {
      fs.writeFileSync(cacheJsonPath, JSON.stringify(site, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + cacheJsonPath);
    }
  }

  // deploy reloaded
  msg = 'Write deploy reloaded config to workspace settings?';
  if (yesToAll || (await confirmAction(msg))) {
    let workspaceSettingsPath = settingsPath + '/settings.json';
    try {
      let settings = {};
      if (fs.existsSync(workspaceSettingsPath)) {
        settings = JSON.parse(fs.readFileSync(workspaceSettingsPath));
      }
      settings['deploy.reloaded'] = deployConfig;
      fs.writeFileSync(workspaceSettingsPath, JSON.stringify(settings, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + workspaceSettingsPath);
    }
  }

  // launch.json
  msg = 'Write xdebug configuration to launch.json?';
  if (yesToAll || (await confirmAction(msg))) {
    let launchPath = settingsPath + '/launch.json';
    try {
      let settings = {
        version: '0.2.0',
        configurations: []
      };
      if (fs.existsSync(launchPath)) {
        settings = JSON.parse(fs.readFileSync(launchPath));
      }
      settings.configurations.push(debugData);
      fs.writeFileSync(launchPath, JSON.stringify(settings, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + launchPath);
    }
  }

  // winscp.ini
  msg = 'Write winscp.ini?';
  if (process.platform == 'win32') {
    const config = vscode.workspace.getConfiguration('ansible-server-sites');
    const winscpIniPath = config.get('winscp_ini_path') || process.env.APPDATA + '\\winscp.ini';
    if (fs.existsSync(winscpIniPath)) {
      if (yesToAll || (await confirmAction(msg))) {
        try {
          fs.appendFileSync(winscpIniPath, '\n\n' + winscpConfig);
        } catch (err) {
          vscode.window.showErrorMessage('Unable to write to ' + winscpIniPath);
        }
      }
    } else {
      vscode.window.showErrorMessage(
        winscpIniPath +
          ' not found, open Options - Preferences - Storage - set Configuration storage - Automatic or Custom INI file'
      );
    }
  }
}

async function confirmAction(message) {
  const answer = await vscode.window.showInformationMessage(
    message,
    {
      title: 'Yes',
      id: 'Yes'
    },
    {
      title: 'No',
      id: 'No'
    }
  );
  return answer && answer.id == 'Yes';
}

function selectSite(sites) {
  let options = sites.map(function(site) {
    return {
      label: punycode.toUnicode(site.domain),
      description: site.host + (site.group ? ' / ' + site.group : '')
    };
  });

  let promise = new Promise((resolve, reject) => {
    let p = vscode.window.showQuickPick(options, { placeHolder: 'domain' });
    p.then(function(val) {
      //console.log('selected: ', val);
      if (val === undefined) {
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
function deactivate() {}
exports.deactivate = deactivate;

function getSites() {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  const cacheTime = config.get('json_cache_time', 300);
  return new Promise((resolve, reject) => {
    // cache
    if (sitesCache.sites.length > 0) {
      let cacheAgeSeconds = (new Date().getTime() - sitesCache.time.getTime()) / 1000;
      // console.log('cache age: ' + cacheAgeSeconds);
      if (cacheAgeSeconds < cacheTime) {
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
        if (response.status != 200) {
          throw new Error('Failed to fetch ' + url + ', status ' + response.status);
        }
        return response.json();
      })
      .then(json => {
        sitesCache.sites = json.sites;
        sitesCache.time = new Date();
        // console.log('store global cache');
        resolve(sitesCache.sites);
      })
      .catch(err => console.error(err));
  });
}
