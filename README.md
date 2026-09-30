# 🥗 Calorie Tracker

A simple web app to log your food and track daily calories.

## Features

- **Log food** by meal (breakfast, lunch, dinner, snacks). Search about 65 common foods to fill in calories automatically, or type your own. Foods you've entered before show up in search too.
- **Daily progress**: a ring shows how much you've eaten and how many calories are left.
- **Easy food ideas**: if you're under your goal, the app suggests very easy meals and snacks (1–15 min) that fit your remaining calories, with ingredients and steps. Tap **I ate this** to log one.
- **History**: every day is saved automatically. See a chart of the last 7/14/30/90 days with your goal line, averages, and a list of all logged days. Tap a day to see or edit it.
- **Goal calculator**: estimates your daily need from age, weight, height and activity (Mifflin–St Jeor).
- **Backup**: export or import your data as JSON, or export daily totals as CSV (opens in Excel or Sheets).

## Running it

It's plain HTML/CSS/JS with no install and no build step. Open `index.html` in a browser, or host it for free with GitHub Pages:

1. In the repo on GitHub, go to **Settings → Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, then pick the branch and `/ (root)`.
3. Open the URL GitHub shows you. On your phone, use **Add to Home Screen** so it works like an app.

## Where is my data?

Data is saved in your browser's local storage on the device you use. It isn't sent anywhere. Each device or browser has its own separate log, so use **Settings → Export / Import** to back it up or move it to another device. Clearing your browser's site data will delete the log, so export a backup now and then.
