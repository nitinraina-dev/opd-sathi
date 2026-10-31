# Put OPD Saathi online with Render

This puts OPD Saathi on a free public `https://…onrender.com` address, so it works on any phone, anywhere. It uses two free services: **MongoDB Atlas** for the database and **Render** to run the app. It takes about 20 minutes the first time.

Have these ready (the same values as in `server/.env` on your computer):

- the Gemini API key (optional),
- a Telegram bot token (optional; see step 6),
- an admin password you choose for the online app.

## 1. Make sure GitHub has the latest code

Render builds the app from GitHub, not from your computer. In the project folder:

```
git add -A
git commit -m "Ready for Render"
git push
```

If Git says there is nothing to commit, it's already up to date.

## 2. Make a free database (MongoDB Atlas)

1. Sign up at https://www.mongodb.com/cloud/atlas/register.
2. Create a cluster: choose **M0 (Free)**, provider **AWS**, region **Singapore** or **Mumbai** (close to the Render server).
3. **Database Access → Add new database user.** Choose a username, and a password with only letters and numbers: characters like `@`, `:` or `/` break the link in step 5. Give it **Read and write to any database**.
4. **Network Access → Add IP address → Allow access from anywhere** (`0.0.0.0/0`). Render's free servers have no fixed address, so this is needed.
5. **Database → Connect → Drivers.** Copy the connection string, put your password in it, and add `opd-saathi` before the `?`:

   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/opd-saathi?retryWrites=true&w=majority
   ```

   This is your **`MONGODB_URI`**. It contains the database password, so keep it private.

## 3. Create the app on Render

1. Sign up at https://render.com with your GitHub account.
2. Click **New → Blueprint**.
3. Connect GitHub if asked, and pick the **opd-sathi** repository. Render reads the project's `render.yaml`, which sets up everything: the build, the start command, the Singapore region, Indian time, and secure login cookies.
4. Render asks for the values marked secret:

   | Setting | What to put |
   |---|---|
   | `MONGODB_URI` | the Atlas connection string from step 2 (**required**) |
   | `STAFF_ADMIN_PASSWORD` | the admin password you choose for the online app |
   | `GEMINI_API_KEY` | the Gemini key, or leave empty |
   | `TELEGRAM_BOT_TOKEN` | a bot token, or leave empty (see step 6) |

   `SESSION_SECRET` and `SECRETS_KEY` are made for you; leave them.
5. Click **Apply**. The first build takes about 5 minutes.

## 4. Check that it works

On Render, open the **opd-saathi** service, then **Logs**. Look for these lines:

- `OPD Saathi server on http://localhost:…  (storage: MongoDB (opd-saathi))`

  It must say **MongoDB**. If it says **file**, the app couldn't reach Atlas, and its data will be lost on every restart. Check the connection string and the Network Access step, then use **Manual Deploy → Deploy latest commit**.
- `Staff login created: username "admin" password from STAFF_ADMIN_PASSWORD` (only on the very first start)
- `Telegram: @yourbot answers patients and sends their alerts.` (only if you set a bot token)

Your address is at the top of the service page, something like `https://opd-saathi.onrender.com`. If that name is taken, Render adds a few letters to it.

## 5. First use

1. Open `https://YOUR-ADDRESS/staff` and log in as **admin** with the password from step 3.
2. Open **Demo stage** and press **Set up the demo**.
3. The online database starts empty, so add the n8n links again if you use them: **Forecast → Automation with n8n**, paste the links, save.
4. Open the patient app on a phone: `https://YOUR-ADDRESS`. Over https, the camera (QR scan), the microphone and phone alerts all work.

## 6. Telegram: one bot, one server

A bot can be read by only one running server at a time. If the same bot token is used on Render and on a laptop, they fight over messages, and the log says another program is reading the bot's messages. So either:

- put the token only on Render, and stop the app on your laptop when the online one is in use, or
- use a different bot on Render. Message **@BotFather** in Telegram, send `/newbot`, and paste its token as `TELEGRAM_BOT_TOKEN` (Render: **Environment**, then save; the app restarts).

## 7. Updating the online app

Every `git push` to the `main` branch rebuilds and restarts the online app on its own. Your data stays in Atlas.

To change a key or password later: Render → the service → **Environment** → edit → **Save changes**. The app restarts with the new value.

## 8. The free plan sleeps

A free Render app goes to sleep after about 15 minutes without visitors. The next visit wakes it in about a minute, and the Telegram bot doesn't answer while it sleeps. Before a demo, open the site a few minutes early.

To keep it awake, a free monitor such as https://uptimerobot.com can visit `https://YOUR-ADDRESS/api/health` every 5 minutes. Render's free hours cover one app running all month.

## 9. If something goes wrong

- **The build failed:** read the end of the build log. Usually it's a typo in the code that was pushed; fix it, push again, and Render rebuilds.
- **Logs say `storage: file`:** see step 4.
- **The admin password doesn't work:** `STAFF_ADMIN_PASSWORD` is used only the first time the app starts on an empty database. To set a new one, run this on your computer from the project folder, with your Atlas link:

  ```
  MONGODB_URI="your-atlas-link" npm run staff:reset -- admin
  ```

  It prints a new password.
- **The page is slow to open:** it was asleep (step 8).
