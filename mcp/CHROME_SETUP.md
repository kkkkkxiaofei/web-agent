The following steps are to launch Chrome with debug mode in order to use puppeteer to automate the current user's profile.

- 1 list out all the profiles in chrome
```sh
ls "$HOME/Library/Application Support/Google/Chrome/"
```
You can find some folders like "Default", "Profile 1", "Profile 2", "Profile 3", etc.

- 2 create a new user data directory
```sh
mkdir -p "$HOME/chrome-automation-profile"
```

- 3 copy the profile you want to use into new user data directory
```sh
cp -r "$HOME/Library/Application Support/Google/Chrome/Profile 3" "$HOME/chrome-automation-profile"
```

- 4 launch Chrome with the new user data directory and the specified profile 
```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-automation-profile" \
  --profile-directory="Profile 3"
```

The errors don't affect the automation as long as you can see the log as follows:
```
DevTools listening on ws://127.0.0.1:9222/devtools/browser/072b865b-a5a0-4330-a712-33f38aa22d09
```