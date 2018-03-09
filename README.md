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

For Winscp.ini write you should open Options - Preferences - Storage - set Configuration storage - Automatic INI file

## Extension Settings
- `ansible-server-sites.json_url` - URL to your generated JSON with site list
- `ansible-server-sites.json_cache_time` - cache time JSON data, in seconds
