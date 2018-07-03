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
const cacheJsonPath = getSettingsDirectory() + '/.ansible-site';

function activate(context) {
  let subscriptions = [];

  subscriptions.push(
    vscode.commands.registerCommand('ansible-server-sites.site-ssh', commandSiteSSH)
  );
  subscriptions.push(
    vscode.commands.registerCommand('ansible-server-sites.ssh-tunnel', commandSSHTunnel)
  );
  subscriptions.push(
    vscode.commands.registerCommand('ansible-server-sites.winscp', commandSiteWinSCP)
  );
  subscriptions.push(
    vscode.commands.registerCommand('ansible-server-sites.site-putty', commandSitePuTTY)
  );
  subscriptions.push(
    vscode.commands.registerCommand('ansible-server-sites.site-clone', commandGitClone)
  );
  subscriptions.push(
    vscode.commands.registerCommand('ansible-server-sites.site-configs', commandSiteConfigs)
  );

  for (let i = 0; i < subscriptions.length; i++) {
    context.subscriptions.push(subscriptions[i]);
  }
}
exports.activate = activate;

async function commandSiteSSH() {
  let sites = await getSites();
  let site = await selectSite(sites);
  let terminal = vscode.window.createTerminal(site.domain);
  terminal.sendText(site.ssh_command);
  terminal.show();
}

async function commandSSHTunnel() {
  let sites = await getSites();
  let site = await selectSite(sites);
  let terminal = vscode.window.createTerminal(site.domain + 'SSH tunnel');
  terminal.sendText(site.ssh_command + ' -R 9000:localhost:9000');
  terminal.show();
}

async function commandSiteWinSCP() {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  let sites = await getSites();
  let site = await selectSite(sites);
  let winscpPath = config.get('winscp_path');
  let userHost = site.user + '@' + site.host;
  exec(`"${winscpPath}" "${userHost}`);
}

async function commandSitePuTTY() {
  const config = vscode.workspace.getConfiguration('ansible-server-sites');
  let sites = await getSites();
  let site = await selectSite(sites);
  let puttyPath = config.get('putty_path');
  let userHost = site.user + '@' + site.domain;
  exec(`START ${puttyPath} ${userHost}`);
}

async function commandGitClone() {
  let sites = await getSites();
  let site = await selectSite(sites);

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

function createSettingsDirectory() {
  let path = getSettingsDirectory();
  if (!fs.existsSync(path)) fs.mkdirSync(path);
}

function getSettingsDirectory() {
  return vscode.workspace.rootPath + '/.vscode';
}

async function commandSiteConfigs() {
  let sites = await getSites();
  let site = await selectSite(sites);

  if (!site) {
    return false;
  }

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

  let answer;

  // .ansible-site
  if (!fs.existsSync(cacheJsonPath)) {
    answer = await vscode.window.showInformationMessage(
      'Bind current project to ' + site.domain + '?',
      {
        title: 'Yes',
        id: 'ansible-server-bind-site'
      },
      {
        title: 'No',
        id: 'No'
      }
    );
    if (answer && answer.id == 'ansible-server-bind-site') {
      try {
        createSettingsDirectory();
        fs.writeFileSync(cacheJsonPath, JSON.stringify(site, null, '\t'));
      } catch (err) {
        vscode.window.showErrorMessage('Unable to write to ' + cacheJsonPath);
      }
    }
  }

  // deploy reloaded
  answer = await vscode.window.showInformationMessage(
    'Write deploy reloaded config to workspace settings?',
    {
      title: 'Yes',
      id: 'ansible-server-deploy-config'
    },
    {
      title: 'No',
      id: 'No'
    }
  );
  if (answer && answer.id == 'ansible-server-deploy-config') {
    let settingsPath = getSettingsDirectory() + '/settings.json';
    try {
      createSettingsDirectory();
      let settings = {};
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath));
      }
      settings['deploy.reloaded'] = deployConfig;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + settingsPath);
    }
  }

  // launch.json
  answer = await vscode.window.showInformationMessage(
    'Write xdebug configuration to launch.json?',
    {
      title: 'Yes',
      id: 'ansible-server-xdebug-config'
    },
    {
      title: 'No',
      id: 'No'
    }
  );
  if (answer && answer.id == 'ansible-server-xdebug-config') {
    let settingsPath = getSettingsDirectory() + '/launch.json';
    try {
      createSettingsDirectory();
      let settings = {
        version: '0.2.0',
        configurations: []
      };
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath));
      }
      settings.configurations.push(debugData);
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, '\t'));
    } catch (err) {
      vscode.window.showErrorMessage('Unable to write to ' + settingsPath);
    }
  }

  // winscp.ini
  if (process.platform == 'win32') {
    const config = vscode.workspace.getConfiguration('ansible-server-sites');
    const winscpIniPath = config.get('winscp_ini_path') || process.env.APPDATA + '\\winscp.ini';
    if (fs.existsSync(winscpIniPath)) {
      answer = await vscode.window.showInformationMessage(
        'Write winscp.ini?',
        {
          title: 'Yes',
          id: 'ansible-server-write-winscp'
        },
        {
          title: 'No',
          id: 'No'
        }
      );
      if (answer && answer.id == 'ansible-server-write-winscp') {
        try {
          fs.appendFileSync(winscpIniPath, '\n\n' + winscpConfig);
        } catch (err) {
          vscode.window.showErrorMessage('Unable to write to ' + cacheJsonPath);
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

function selectSite(sites) {
  let options = sites.map(function(site) {
    return {
      label: punycode.toUnicode(site.domain),
      description: site.host + (site.group ? ' / ' + site.group : '')
    };
  });

  let promise = new Promise((resolve, reject) => {
    if (vscode.workspace.rootPath && fs.existsSync(cacheJsonPath)) {
      let jsonRaw = fs.readFileSync(cacheJsonPath).toString();
      let site = JSON.parse(jsonRaw);
      resolve(site);
      return;
    }

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
