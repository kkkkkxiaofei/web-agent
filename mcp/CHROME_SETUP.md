The following steps are to launch Chrome with debug mode in order to let Puppeteer to interact with the current browser tab that has user's profile.

> They are only verified on macOS.

- 1 List out all the profiles in your existing Chrome

```sh
ls "$HOME/Library/Application Support/Google/Chrome/"
```
You can find some profile-like folders, "Default", "Profile 1", "Profile 2", "Profile 3", etc.

- 2 Create a new user data directory

```sh
mkdir -p "$HOME/chrome-automation-profile"
```

- 3 Copy the profile you want to use into new user data directory

```sh
cp -r "$HOME/Library/Application Support/Google/Chrome/Profile 3" "$HOME/chrome-automation-profile"
```

- 5 Launch Chrome in debugging mode with specified user data directory and profile 

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-automation-profile" \
  --profile-directory="Profile 3"
```

You might see errors in your terminal, but they don't affect the automation as long as the websocket server is running:

```
DevTools listening on ws://127.0.0.1:9222/devtools/browser/072b865b-a5a0-4330-a712-33f38aa22d09
```