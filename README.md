# ansible-server-sites README
Operations with sites deployed with viasite-ansible/ansible-server


## Features
- Git clone site
- SSH to site
- Generate configs for site
- Add site to winscp.ini

### Git clone site
You shold define you projects root directory (in my case `~/projects/site`),
then projects will be searched at this place.

### SSH to site
Open site SSH console in 3 clicks

### Generate configs
- store link to site in `.vscode/.ansible-site`
- show config for `ftp-simple`
- show config for remote debug site
- try to write config for remote site in winscp.ini

For Winscp.ini write you should store your WinSCP settings in INI file.
To do this, open Options - Preferences - Storage, and  set Configuration storage as "Automatic INI file" or "Custom INI file".
In case Configuration Storage as "Custom INI file", open VSCode settings, and define setting "ansible-server-sites.winscp_ini_path"

## Extension Settings
- `ansible-server-sites.json_url` - URL to your generated JSON with site list
- `ansible-server-sites.json_cache_time` - cache time JSON data, in seconds
- `ansible-server-sites.winscp_ini_path` - path to your WinSCP.ini file
