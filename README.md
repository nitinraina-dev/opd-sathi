# OPD Saathi

A hackathon prototype for **City District Hospital** (a made-up government hospital). With it, a patient can:

- register in Hindi or English,
- get an OPD slip with a token,
- follow their place in the queue,
- find the right room with step-by-step, landmark-based directions,
- know when to go in,
- come back with test reports and go in near the front, not at the end,
- send their turn to family, who can follow it on their phone or on Telegram,
- say how the visit went, with one tap or by SMS.

Patients can pay the small OPD fee and any tests by UPI or in cash, and free-care groups never pay; payment never holds up a token or a doctor. Staff log in to a live dashboard, a registration counter, a payments desk and a waiting-room TV board. A crowd forecast uses weather, air quality, road traffic, the real queue and this hospital's own history. Phones get alerts even with the screen closed, and n8n can send real SMS and staff alerts.

All hospital data and patients are made up. The app never asks for Aadhaar or ABHA numbers.

**Emergencies come first.** An Emergency button sits on every patient screen, and the first registration screen lists danger signs. "I need urgent help" puts a flag at the top of the staff dashboard, with sound. The app never decides whether something is an emergency and never makes anyone wait.

---

## Design

- **Calm by default.** The page is a cool hospital-wall grey; buttons are ward green (like hospital signboards); red is used only for Emergency.
- **The token is the one bold thing.** It is a yellow paper ticket, like the carbon OPD slip, shown the same way on Home, the slip and My token, so people always recognise "my token".
- **Easy to get around.** Every patient screen has a slim top bar (Back, Listen, Emergency) and bottom tabs (Home, My token, Find, Help, Settings). Help, which sends a staff member to the patient, is one tap away everywhere. Directions have *Steps* and *Map* tabs. Staff get a sidebar grouped by job, which opens from a Menu button on phones.
- **Phone first, fine on a laptop.** On phones everything is one column. From tablet width (768px) the bottom tabs become a row of links under the top bar, and Help and Settings move into the top bar. Pages use the extra room: Home puts the actions next to your token (or "How it works"), the slip and My token put the ticket next to what to do, and Plan your visit puts today next to the week. From laptop width (1024px) directions show the steps and both floor plans side by side instead of tabs. Forms (Register, I have my slip, Settings) stay narrow and centred.
- **Staff screens are for working fast.** Buttons keep their words on one line and are 44px tall; when a row is full, whole buttons move down instead of their words breaking. Each room on the dashboard has one solid button, *Call next*; the doctor's status is a slim switch that turns amber for a break or running late. Every staff screen starts with *How to use this screen*: the everyday jobs and the button for each, in English or Hindi. It is open the first time and remembered once folded away.
- **Readable, not huge.** Text is 16px by default. *Settings → Text size* offers Large (18px) and Largest (20px), and "Someone is helping me" adds one step. Buttons are at least 48px tall, and the main action on a screen is 56px.
- **Fewer words.** Choices are rows with a one-line description. Explanations of words like OPD, token and Casualty show the first time only.

## Stack (MERN)

| Part | What |
|---|---|
| **M**ongoDB | Patients, flags, messages, calls, staff accounts, phone-alert subscriptions, daily history (Mongoose models in `server/src/models.js`) |
| **E**xpress | REST API, live updates over Server-Sent Events, staff login, web push (`server/src`) |
| **R**eact | Vite + Tailwind CSS 4 + React Router, plain JavaScript (`client/src`) |
| **N**ode | Node 20.19+ or 22.12+ |
| n8n | Optional automation: SMS alerts and SMS replies, Telegram alerts, live traffic, morning forecast (`n8n/`) |
| Google Gemini | Optional: understands free-form questions in the Ask helper (`GEMINI_API_KEY`); word matching works without it |

The queue rules live in one place, `client/src/lib/engine.js`. The server runs them, and the browser runs the same file in **offline mode**: if the server is not reachable, the app falls back to localStorage + BroadcastChannel, so the patient screen, dashboard and board still sync between tabs of one browser.

## Run it

```bash
cd opd-saathi
npm install          # installs client and server (npm workspaces)
npm run dev          # starts Express on :5050 and React on :5173
```

Then open these, each in its own tab:

- Patient app: http://localhost:5173
- Staff dashboard: http://localhost:5173/staff (asks you to log in)
- Waiting-room board: http://localhost:5173/board
- Registration counter: http://localhost:5173/staff/counter
- Forecast + n8n settings: http://localhost:5173/staff/forecast
- Staff accounts: http://localhost:5173/staff/accounts
- **Demo stage** (everything on one screen, one-click setup): http://localhost:5173/stage

**Staff login.** On the very first start the server makes an `admin` account and prints its password once in the terminal:

```
Staff login created:  username "admin"  password "xxxx-xxxx-xxxx"
```

To choose it yourself, set `STAFF_ADMIN_PASSWORD` in `server/.env` before the first start. Lost it? Run `npm run staff:reset -- admin` for a new random one, or `npm run staff:reset -- admin MyNewPass1` to set one. The admin can then add accounts for doctors, nurses and reception under **Accounts**.

**MongoDB.** By default the server uses `mongodb://127.0.0.1:27017/opd-saathi`. You can use a local `mongod`, `docker run -d -p 27017:27017 mongo:7`, or an Atlas link: copy `server/.env.example` to `server/.env` and set `MONGODB_URI`. If MongoDB is not running, the server says so and keeps its data in `server/data/*.json` instead, so the demo still works.

**Production (one port).** Run `npm run build` and then `npm start`. Express serves the built app and the API on http://localhost:5050.

**Phones on the same Wi-Fi.** Run `npm run dev:phone` and open the **Network** URL it prints (for example `https://192.168.1.20:5173`) on the phone. It uses a self-signed certificate, so the phone shows a warning once; accept it. Over HTTPS the camera (QR scan), the microphone and notifications work. Phone alerts with the screen closed (web push) need a real certificate. To test those on a phone, run `npm run build && npm start` and open it through a tunnel with a real certificate, for example `cloudflared tunnel --url http://localhost:5050`.

**TV board.** The board must be tapped once before it may speak (a browser rule). For a TV with no keyboard, start Chrome in kiosk mode with sound allowed:

```
google-chrome --kiosk --autoplay-policy=no-user-gesture-required "http://SERVER:5050/board?autostart=1"
```

`?autostart=1` skips the start screen.

## Put it online (for a demo link)

All three options use MongoDB, and the server prints the admin password in its log on first start (or set `STAFF_ADMIN_PASSWORD`).

- **Render + MongoDB Atlas (free tiers).** Make a free Atlas cluster and copy its connection string. On Render choose *New → Blueprint* and pick this repository: `render.yaml` sets everything up. Paste the Atlas link as `MONGODB_URI`. You get an `https://….onrender.com` address, so phone alerts (web push), the camera and the microphone work on phones.
- **Docker** (any server). `docker compose up --build` starts MongoDB and the app on port 5050. On its own: `docker build -t opd-saathi .` and run it with `MONGODB_URI` set.
- **Quick demo from your laptop.** Run `npm run build && npm start`, then `cloudflared tunnel --url http://localhost:5050` (install with `brew install cloudflared`). This gives a temporary public https link.

Behind any of these, keep `TRUST_PROXY=1` (already set in `render.yaml` and `docker-compose.yml`) so login cookies are marked Secure.

Keep `TZ=Asia/Kolkata` too (set in `render.yaml` and the `Dockerfile`). Hosting services run on UTC, and the server's clock decides doctors' breaks, which day a booking is for, and the hours the forecast learns. On a laptop in India it is already right.

**Checks.** `npm run check` tests:

- English/Hindi key parity, and that every text key used in the code exists,
- routes between all 1,860 pairs of places, in both modes,
- that "Avoid stairs" never uses stairs, and that every direction step renders in both languages,
- the queue engine, the forecast model and what it learns from history (including separating rain from weekday effects),
- staff roles, and that the public queue has no names or phone numbers,
- payments: free care, card checks, UPI and cash, tests, part payments, refunds, moving a bill with the patient, and that an unpaid patient is still queued and called.

## The demo stage (for judges)

**Staff → Demo stage** (`/stage`, staff login) shows everything on one projector screen, live:

- the patient's phone, with quick buttons for Home, Register, Ask and Plan,
- a **basic phone** that only does SMS,
- the waiting-room board,
- the staff dashboard,
- an **impact** strip counted from the day's records: registered on a phone, joined the line on arrival, missed turns rescued, free visits confirmed, how fast urgent alerts were seen, people back with test reports, how many waits came true within 5 minutes, and what patients said about their visit.

**Set up the demo** (admin) makes a believable day in one click:

- ten visits from earlier this morning: the wait each was told and the real one, feedback from eight of them, and one patient (Ramesh, MED-002) still at the tests,
- a busy line, plus two phone bookings that haven't arrived yet,
- four weeks of history, so the forecast has learned and the early warning shows,
- a dengue alert, sample PM-JAY claims,
- a ₹50 Emergency fee with two Emergency visits.

Offline it does what the browser can. A suggested 3-minute walkthrough:

1. **Patient phone → Ask:** "X-ray kahan hai?". The answer is read aloud, with *Show the way*. Then "मेरी बारी कब आएगी?".
2. **Basic phone:** text a token (`MED 3`), then `KAHAN XRAY`. Replies come back in Hindi, and "your turn is close" texts arrive here when doctors call.
3. **Board:** "Just arrived? Join the line" with the changing code. A booking only joins the line here.
4. **Dashboard:** "Tomorrow looks very busy", the dengue alert, nearby hospitals. Switch on *Doctors call on their own* and *Speed time up 10x* to watch the line move.
5. **Dashboard → How we did today:** how many waits came true within 5 minutes of what we told people, and the day's feedback. Under General Medicine, **At tests** shows Ramesh: tap *Back with reports* and he goes in after 2 people, not at the end. Text his token on the basic phone, and after the doctor sees him, reply `1`.
6. **Staff → Forecast:** busy days ahead, local news suggestions, the early warning, what the forecast learned. **Emergency desk** and **PM-JAY claims** show the rest.

## Two-minute demo (by hand)

0. **Staff tab:** open `/staff` and log in as `admin`.
1. **Patient tab:** choose a language, then tap Register. Do the safety check, then Kamla, 62, Woman, skip the phone number, General Medicine, then *Get my token*. The slip says **Not in the line yet** and **Free once staff confirm**: booking on a phone holds no place, and nobody has checked her age.
2. **Board tab** (open it from the staff menu, so it is logged in): tap *Start with sound*. Kamla's token is *not* on the board. The top of the board shows **Just arrived? Join the line** with a QR code and a 6-digit code that changes every 2 minutes.
3. **Patient tab:** type that code into *Join the line* on the slip (on a real phone, scan the QR code instead). The token now appears under "Next". Someone without a camera can be checked in at **Registration counter → Booked on a phone? Check them in**.
4. **Patient tab:** tap *I need urgent help*, then *Send alert now*. The **dashboard** shows a red flag at the top within a second and sounds an alarm until someone taps *Mark as seen*. The patient then sees "A staff member has seen your alert".
5. **Dashboard:** tap *Add 20 sample patients*, then *Speed time up 10x*, then switch on *Doctors call the next patient on their own*.
6. Open *Follow my turn* and tap *Allow alerts on this phone*. The patient sees how many people are ahead and the estimated wait. At 3 ahead, the screen shows a banner, rings, vibrates and shows a simulated SMS. When the token is called, the board reads it aloud in English and Hindi, and the patient screen shows "It is your turn!" with directions to the room. In Room 1's card on the dashboard, the doctor taps **Age looks right: free**, and Kamla's ₹10 disappears.
7. **PM-JAY:** on the Payments page tap *Card seen: free* for a patient who registered with a PM-JAY card. Call them on the dashboard, then tap *Admit under PM-JAY*, pick *Cataract operation*, and *Start the claim*. Their phone now shows the PM-JAY card. Under **PM-JAY claims**, open the claim and record *PM-JAY approved the pre-auth*: the phone changes to "PM-JAY will pay". *Add sample claims* fills the page with claims at every stage.
8. **Forecast tab:** try the *What if…* switches (heavy rain, heat wave, bad air, traffic jam) and watch the crowd forecast and staff suggestions change. Then tap *Load 4 weeks of sample history* to see the forecast learn this hospital's pattern (busier Mondays, a peak at 10:00).

## Project layout

```
client/src/
  data/hospital.js      floors, places (x/y, door, landmark key), paths with metres + stairs flag
  data/departments.js   rooms, doctors, OPD hours 9:00–14:00, sample consultation time
  data/patients.js      24 made-up sample patients (no phone numbers)
  data/fees.js          OPD fee, tests, free-care rules
  data/pmjay.js         made-up PM-JAY packages, wards, claim papers
  i18n/en.js, hi.js     every piece of text, same keys
  lib/engine.js         all queue changes (shared by server and browser)
  lib/queue.js          people ahead, doctor status, wait estimate
  lib/route.js          Dijkstra shortest path, "avoid stairs"
  lib/directions.js     turn-by-turn directions with landmarks ("third door on your left")
  lib/model.js          weather/air/traffic: Open-Meteo, n8n feed, sample data, traffic model
  lib/predict.js        crowd and wait forecast (now, today by hour, next 7 days)
  lib/store.js          server mode (API + live stream) or offline mode (localStorage)
  lib/permissions.js    staff roles, and what the public may see (shared with the server)
  lib/billing.js        bills, free care, receipts
  lib/claims.js         PM-JAY claim steps and checks (shared with the server)
  lib/checkin.js        joining the line at the hospital (the screen code)
  lib/ask.js            the Ask helper and SMS replies: urgent words, word matching, facts for Gemini
  lib/nearby.js         sharing the load with nearby hospitals (data/nearby.js: made up)
  lib/impact.js         today's impact numbers (demo stage), waits as promised, feedback
  lib/feedback.js  lib/share.js   "how was your visit?", "Send to family" (data/feedback.js: faces, reasons)
  pages/Ask.jsx  pages/Stage.jsx
  lib/auth.js           staff login on the client
  lib/notify.js         notifications and web-push opt-in
  pages/                patient screens; pages/staff/ staff screens (Login, Accounts…); Board.jsx
client/public/sw.js     service worker: push alerts, offline app shell
server/src/
  index.js  api.js  hospital.js  db.js  models.js  auth.js  push.js  stats.js
  audit.js  n8n.js  conditions.js  forecast.js  payments.js  claims.js  secretbox.js
  checkin.js (check-in code)  limit.js (registration limits)  signals.js (alerts, news)
  ask.js (Gemini helper)  sms.js (SMS replies)  telegram.js (patients' Telegram bot)
  demo.js (one-click demo day)
  cli.js (staff:reset)
Dockerfile  docker-compose.yml  render.yaml   deployment
n8n/                    three workflows to import
scripts/check.js        logic tests
```

## Keeping the line fair

A token from a phone used to go straight into the line. Someone at home could hold a place ahead of people standing in the hospital, one person could take many tokens, and anyone could type an age of 60 to get a free visit. Now:

- **Book anywhere, join the line on arrival.**
  - A phone registration is a *booking*. It has a token but holds no place: the board, the doctors and "people ahead" ignore it.
  - The place in the line starts at check-in, at the end of the line. To check in, scan the code on the waiting-room screen. The code changes every 2 minutes and still works for about 6, so a photo sent to someone at home soon stops working. Without a camera, type the code, or show the slip at the registration counter.
  - Scanning the code *before* registering on a phone joins the line straight away.
  - Bookings are for the same day.
  - Only logged-in staff screens can get the code. Open the waiting-room board from the staff menu.
- **Missed your turn?** After a no-show, the person checks in again the same way and goes to the end of the line.
- **Limits.**
  - One open token per phone per department (a phone id kept in a cookie).
  - At most 20 phone registrations per internet address every 10 minutes (`REGISTER_LIMIT`). Mobile networks put many phones behind one address, so the cap is generous.
  - The counter is never limited. A second person for the same doctor registers there.
  - These limits only stop casual grabbing. The real protection is that a booking does nothing until the person is at the hospital.
- **Free care is confirmed by a person.**
  - At the counter, staff can see the person, so age-based free care counts at once.
  - Typed into a phone, age 60+, a child under 5 or pregnancy care is only a claim. The slip says "Free once staff confirm" and ₹10 shows as due.
  - Staff confirm with one tap: at the counter check-in, on the Payments page, or by the doctor at the door (*Age looks right: free* / *Age not right: fee due*). Free-care cards work the same way.
  - Nothing here holds up care: an unconfirmed person still sees the doctor, and Emergency never waits.
- **For a quick demo,** an admin can switch off *Phones join the line only at the hospital* in Demo controls.

## Payments

Payment is built so it can **never hold up care**. Every patient gets a token, doctors can call anyone, and Emergency never asks for money.

**Fees and free care** (sample values in `client/src/data/fees.js`):

- **The fee:** an OPD fee of ₹10, and tests the doctor adds after the visit (blood tests, ECG, X-ray).
- **Free without a card:** people aged 60 and over, children under 5, and pregnancy care (Women and pregnancy). At the counter this counts at once. Typed into a phone, staff confirm it first (see *Keeping the line fair*).
- **Free with a card that staff see at the counter:** ration card (BPL/Antyodaya), Ayushman Bharat (PM-JAY), or a disability certificate. The app never asks for or stores the card number.

**Emergency visits (optional fee).** Government hospitals usually don't charge for Emergency, but some hospitals do.
- **Setting the fee.** An admin sets it at **Staff → Emergency desk → Emergency visit fee**. It is ₹0 (free) by default.
- **Billing after care.** The fee is billed **after care, never before**. Staff record the visit on the Emergency desk once the patient is being looked after; name and age can stay empty. They take the fee then or later, or note a free-care card.
- **Free care still applies.** Age 60 or over, under 5, or a card staff have seen.
- **Kept out of the OPD.** Emergency visits (tokens `EMR-001`…) are never in an OPD line or on the board.
- **What patients see.** Their Emergency screen says the fee is paid later and nobody is turned away.
- **PM-JAY.** An Emergency patient can be admitted under PM-JAY from the claims page.

**For patients:**

- **When registering,** they choose *Pay now on my phone (UPI)*, *Pay at the counter*, or *I have a free-care card*.
- **The slip and My turn** show "Paid ₹10", "₹30 to pay" or "Free (senior citizen)", plus a **Pay** button.
- **Receipts** can be printed or saved as a picture.
- **After a test is paid for,** the screen shows the way to the laboratory or X-ray.

**For staff (Payments page, and on the dashboard):**

- Take cash, accept or refuse a free-care card, and add tests to a bill (doctors and nurses).
- See today's totals by cash, UPI and online. Demo and test money is always shown apart from real money.
- Download receipts as a spreadsheet; admins can also give refunds.
- Every step goes into the activity log.

**Modes (admin: Staff → Payments → Payment settings):**

| Mode | What happens | Needs |
|---|---|---|
| **Demo** (default) | A dummy UPI screen with a QR code; "I have paid" is simulated. No money moves. | nothing |
| **Razorpay test** | Real Razorpay checkout (UPI, cards, net banking) with test money | Razorpay **test** Key ID and Key secret |
| **Razorpay live** | Real money | Razorpay **live** keys, and ticking "I understand live mode takes real money" |

To set it up:

1. Create a Razorpay account. In its dashboard, go to *Settings → API Keys* and generate test keys.
2. Paste them under **Razorpay test keys** and tap **Check the Razorpay test keys**. The app asks Razorpay; no money moves.
3. Choose **Razorpay test** and save. Pay a bill from a patient's phone with Razorpay's test details.
4. Optional but recommended: in Razorpay, add a webhook to the link shown on the settings card (events `payment.captured` and `order.paid`), and paste its secret. Then a payment still counts if the patient closes the app mid-payment.
5. When ready, add the live keys and switch to **Razorpay live**.

**How payments are kept safe:**

- **Key secrets** are encrypted in the database (AES-256-GCM) and are never sent to a browser; screens show only the last 4 characters. In production, set `SECRETS_KEY` in `server/.env`.
- **Who can pay:** a patient's phone pays with a private key that only that phone received at registration, so nobody can pay or view someone else's bill.
- **Confirmation:** a payment is confirmed by Razorpay's signature (or the signed webhook), never by the browser saying so.
- **No double charges:** paying twice is impossible, and a payment covers only the items billed when the patient started paying.
- **Privacy:** the public queue shows only the amount due, never which tests.

## PM-JAY (Ayushman Bharat) claims

PM-JAY pays empanelled hospitals for **in-patient** care by *package*: one fixed amount per treatment, covering the stay plus tests and medicines from 3 days before admission to 15 days after discharge. OPD visits are not claimed; in this sample hospital a PM-JAY card simply makes the OPD visit free.

**OPD Saathi does not connect to PM-JAY.** Hospitals do each step in the official PM-JAY portal (TMS). The claims desk here records those steps, so the desk, the doctors and the patient can all see where each claim is, and nothing gets forgotten between admission and payment. In the demo, staff also play PM-JAY's part.

**The steps** (rules in `client/src/lib/claims.js`):

```
admitted, pre-auth asked ─▶ pre-auth approved ─▶ discharged ─▶ claim sent ─▶ claim approved ─▶ money received
   │ ▲ answer                                       (papers ticked)    │ ▲ answer
   ├─ PM-JAY asks a question                                           ├─ PM-JAY asks a question
   └─ pre-auth rejected                                                └─ claim rejected
```

- **Starting a claim.**
  - A doctor taps *Admit under PM-JAY* on the dashboard for the patient in their room. Anyone at the desk can also start one from **Staff → PM-JAY claims → New claim**, including for someone admitted from Emergency who never had an OPD token.
  - The PM-JAY card must have been checked, either at the counter or by ticking "I have seen their card". The card number is never asked for or kept, and neither is Aadhaar or ABHA.
- **Care first.** Nothing in the hospital waits for a claim. The form says so, and an emergency admission is marked as such: the claim is recorded after treatment has started.
- **Checks along the way.**
  - Pre-auth can't be approved above the package rate.
  - A claim can't be sent until the papers usually needed are ticked: photos at admission and discharge, the doctor's notes, test reports, the discharge summary.
  - A claim approved for less than was claimed needs a reason.
  - Closed claims can't change.
- **Packages.** `client/src/data/pmjay.js` has 10 **made-up** packages (codes `DEMO-…`, sample rates). A real hospital would use its state's official package list.
- **Who can do what.**
  - Everyone at the desk can see claims.
  - Doctors and reception move them on.
  - Only reception and admin record money received.
  - Admins can add 8 sample claims at every stage for a demo.
- **The patient** sees a plain card on *My turn* and the slip: the hospital has asked PM-JAY; PM-JAY will pay (you pay nothing, and tests and medicines are covered from 3 days before admission to 15 days after); or not approved (with directions to the help desk). This status lives only on the patient's own record. The public queue and the waiting-room board never show it.
- **Records.**
  - Claims are kept in MongoDB, and a demo reset doesn't delete them.
  - Every step goes into the activity log (claim numbers and tokens, never names).
  - The list downloads as a spreadsheet.

## How the wait estimate works

Each open room becomes free when its consultation in progress ends: about the average consultation time, less the time it has already run. After that it is free again every average consultation. The person with *n* people ahead gets the (*n*+1)th free room. Then any doctor delay is added.

- The **average consultation time** comes from the last 10 consultations, starting from the sample average in `departments.js`.
- **Doctor delay** is the time left on a break, or the minutes a doctor is running late.
- The result is rounded to 5 minutes and shown as "about".

General Medicine has two rooms, so its line moves twice as fast.

**Checking it.** Everyone who joins the line is told a wait, and it is kept on their record (`est`). When they are called, the real wait is compared with it. The dashboard (*How we did today*) and the demo stage show how many were called within 5 minutes of what they were told. The patient's screen shows both numbers after the visit. In a simulated busy morning (100 people at once, a new arrival about every minute, consultations varying by ±40%), 69–81% were called within 5 minutes, about 3–4 minutes off on average. Before the consultation in progress was counted, it was 62–77%, and waits ran 1–3 minutes longer than promised.

## The forecast (weather, air, traffic, local news and alerts)

`lib/predict.js` is a simple model you can explain to judges:

1. **A normal day** brings about 240 OPD patients, spread by department and by hour (the peak is 9–10).
2. **The day is adjusted** for:
   - day of the week (Monday +30%, Saturday −15%, Sunday closed),
   - rain (heavy rain −25%),
   - the day after heavy rain (+10%),
   - heat over 40°C,
   - cold mornings (more children),
   - bad air, AQI over 150 (more breathing and ENT cases),
   - rainy-month fevers.
   - **local alerts** for the days they cover (see *Local alerts and news* below).
3. **Heavy road traffic** delays part of each arrival group by 30 minutes, and makes doctors late at 9:00.
4. **Each department's line** is simulated in 15-minute steps against its doctors' capacity.
5. **It learns from this hospital.** Every registration is counted by day, hour and department, together with that day's weather (`DailyStat` in MongoDB; a demo reset does not clear it). The typical values in 1 and 2 are blended with what really happened here: each typical value counts as 3 days, and real days are added on top. A week of data nudges the forecast; two months mostly decide it.
   - **Weather and weekday are learned separately.** A rainy Monday teaches both "Mondays are busy" and "rain keeps people home", so the forecast learns how much heavy rain, rain and very hot days change attendance at *this* hospital.
   - The Forecast screen shows what it learned: the busiest day, the busiest hour, the rain and heat effects, and from how many days. The sample history for the demo has a hospital where heavy rain halves attendance, so you can watch it learn that.

"Now" predictions start from the **real queue and doctor status**. Staff see:

- expected arrivals in the next hour,
- the wait for someone registering now,
- whether doctors are likely to be late,
- an hourly chart, a 7-day chart, the reasons, and practical suggestions (open an extra counter, put out wet-floor signs, keep ORS ready…).

Patients get **Plan your visit**: the best time to come, a "leave home by" time based on traffic, and weather advice. A reminder sits at the top of that screen: very unwell people should go to Emergency now, not wait for a quiet time.

Data sources, in order:

1. The **n8n conditions feed**, which can add live TomTom traffic.
2. **Open-Meteo** (free, no key).
3. Built-in **sample weather** when there is no internet.

### Local alerts and news

Weather and weekdays explain a lot, but not a dengue outbreak, a mela or a bandh. **Staff → Forecast → Local alerts** covers these:

- **Kinds of alert.** An illness going round (dengue, malaria, flu or viral fever, stomach infections, eye flu, Covid, heatstroke), a festival or mela, a bandh or strike, roads closed or flooded, a health camp, or "other: more/fewer patients". Each has dates and a size (small, medium, large).
- **What an alert does.**
  - An outbreak raises the departments it fills: dengue raises General Medicine and Children; eye flu raises Eyes.
  - A bandh or festival lowers everyone.
  - The starting values are in `client/src/data/signals.js`. They are made up.
- **Local news suggests alerts.**
  - Every 3 hours the server searches Google News for the hospital's town, in English and Hindi. The town is set under Automation, default Lucknow / लखनऊ.
  - Only headlines that name the town and are from the last week count.
  - They are sorted into kinds ("Dengue: 8 reports this week", with links). Staff choose **Add as an alert** or **Ignore**; ignored news stays quiet for a week.
  - **A headline never changes the forecast by itself.** Only the town's name is searched; nothing about patients is sent.
- **The hospital's own numbers warn first.**
  - If a department had more patients than usual on each of the last 3 open days (20% or more in all, compared with the weeks before), the alerts card shows it. For example: "General Medicine: 38% more patients than usual for 3 days. Is something going round? Ask the district health office…".
  - The forecast carries half of that extra into the next week.
  - This often comes before the news.
  - On rainy days the comparison is rougher until the forecast has learned how rain affects this hospital, so a rise can take longer to show.
- **It learns what alerts really do here.**
  - Each day's history records which alerts were on, and alert days are kept out of the "usual day".
  - The forecast learns this hospital's own effect for each kind, for example "Dengue alerts here: General Medicine +31%, Children +22% (7 days)". New alerts of that kind use it.
- **Busy days ahead.**
  - The Forecast page lists the next 7 days against a usual day here (Very busy / Busy / Normal / Quiet), with the main reasons.
  - The Dashboard shows a warning when one of the next 3 days looks very busy.
  - The n8n morning report includes the busy days.
- **Patients' *Plan your visit*** uses the same alerts, but sees only the kind and dates, never staff notes or news links.
- **Sample history.** It includes a dengue spell three weeks ago, a festival day, and a recent rise in fever patients, so the learning and the early warning have something to show.

## After the doctor: tests, reports and feedback

**Back with reports, near the front.** When the doctor adds tests during the consultation, the visit stays open:
- the patient's phone says to go for the tests, and to bring the reports back to the doctor;
- the lab or any staff member can tap **Reports ready** (Dashboard → *At tests*, or the registration counter), and the phone, the SMS and Telegram say so;
- with the reports in hand, the patient joins the line again the usual way: the screen code on their phone, `IN` and the code by SMS, or the registration counter. They go in **after 2 people** (`RETURN_AFTER` in `lib/engine.js`), or at the end of a shorter line, because they have waited once already;
- the doctor sees *Back with reports* next to the token;
- reports are for the same day, like bookings;
- the public queue only knows that reports are pending, never which tests.

**How was your visit?** After the doctor (and after the reports, if there were tests):
- the phone shows three faces. *Good* is one tap. *Okay* or *bad* can say what went wrong: waited too long, hard to find the way, staff not kind, not clean, asked to pay extra;
- the "thank you" SMS asks for a reply of `1`, `2` or `3`; Telegram takes the same reply;
- one answer per visit. Only the patient's own phone (with its key), the number on the slip, or a Telegram chat following that token can answer;
- staff see the day's answers and the most common complaint under *How we did today*. The public queue only knows that an answer was given.

**Send to family.** On the slip and on *My turn*, **Send to family** opens the phone's share menu (WhatsApp, SMS, …) with a link to follow the token. It never includes the name. When the hospital has a Telegram bot, the message also has a link that sends the alerts to the relative's Telegram.

## Ask, SMS and nearby hospitals

**Ask (voice helper)** (`/ask`, on Home): speak or type in Hindi, Hinglish or English. "X-ray kahan hai?", "Kitni der lagegi?", "When does the OPD close?", "Dawai kahan milegi?".
- **The answer.** It is read aloud, with a *Show the way* button.
- **The rules it follows.** It covers only directions, the line, timings, fees and joining the line. **It never gives medical advice.** Urgent words in English, Hinglish or Hindi ("chest pain", "saans nahi", "बेहोश") go straight to **Go to Emergency now**, before anything else and without any AI.
- **With a Gemini key** (`GEMINI_API_KEY` in `server/.env`, from Google AI Studio), Google Gemini understands free-form questions.
  - It uses the Interactions API with model `gemini-3.5-flash-lite` (change it with `GEMINI_MODEL`).
  - Its answer is JSON checked against a schema that allows only real place ids.
  - It is told the hospital's facts and the live queue.
  - It gets the question, queue numbers and the asker's own place in the line, never names. The request is sent with `store: false`.
- **Without a key** (or if Gemini fails), word matching answers instead, so the demo never breaks. Offline it runs in the browser.

**SMS for any phone** (`POST /api/sms/inbound`, through n8n workflow 4 and Twilio, or any gateway). Patients without a smartphone text the hospital number:
- **A token** (`MED 12`) gets their place in the line.
- **`KAHAN XRAY` / `WHERE PHARMACY`** gets where the place is.
- **`IN 123456 MED-12`** joins the line at the hospital (also when back with test reports). It needs the code on the waiting-room screen, and only works from the number on the slip.
- **`1`, `2` or `3`** after the visit says how it was (good, okay, bad). It counts only from the number on the slip; `1 MED 12` names the token.
- **Urgent words** get "go to Emergency now".
- Replies come in Hindi when the text is in Hindi or Hinglish.
- "Your turn is close" texts already go out through workflow 1.
- The gateway must send `SMS_KEY`. Replies never include names.

**Telegram for patients and families** (free). Set `TELEGRAM_BOT_TOKEN` in `server/.env` (make a bot with @BotFather, or reuse the staff-alert bot) and restart. The server asks Telegram for new messages itself (long polling), so it works from a laptop with no public address, and needs no n8n.
- **A token** (`MED 12`), or the *Telegram alerts* link from *Send to family*, gets its place in the line and **follows** it. Telegram then sends "your turn is close", "your token is called", "reports ready", "back in the line" and "how was your visit?".
- **`KAHAN XRAY`**, urgent words and help work as by SMS. **`STOP`** ends the alerts.
- **Joining the line is refused** on Telegram: it needs the patient's own phone or the counter.
- **Only private chats** are answered, and replies never include names. Bill messages are not sent. A demo reset ends every follow, because ids are reused.
- If another program reads the same bot's messages (a Telegram trigger in n8n, or a second server), the server says so in its log; give OPD Saathi its own bot then.

**Sharing the load with nearby hospitals.** When a new patient here would wait 45 minutes or more, people who haven't come yet see a nearby hospital with a shorter wait for the same doctor, on *Plan your visit* and Home.
- **Only when it helps:** the trip plus the wait must save at least 15 minutes.
- **OPD only.** It always says that an emergency goes to the nearest Emergency at once.
- Nobody already in the line loses their place.
- Staff see the nearby waits on the Dashboard and can switch the suggestion off.
- The three nearby hospitals and their waits are **made up** (`client/src/data/nearby.js`). A district would feed real numbers through n8n.

## n8n automation

Import the four files from `n8n/` (Workflows → Import from file):

| Workflow | Trigger | Does |
|---|---|---|
| `1-patient-and-staff-alerts.json` | Webhook `POST /opd-events` | Urgent flag → Telegram message to staff. Turn close / token called / no-show → SMS to the patient in the patient's language, through **Fast2SMS** (India; Hindi as Unicode SMS) or **Twilio**. Everything else is counted. |
| `2-conditions-feed.json` | Webhook `GET /opd-conditions` | Weather + air (Open-Meteo) + live traffic (TomTom, optional free key) → returned in the app's format |
| `3-morning-forecast.json` | Every day 7:30, or open its *Send it now* link | `GET /api/forecast` from the OPD Saathi server → Telegram summary to staff |
| `4-sms-replies.json` | Twilio *A message comes in* webhook `POST /opd-sms-in` | The text goes to `POST /api/sms/inbound` (with `SMS_KEY`), and the reply goes back as TwiML |

To set them up:

1. In **Read event**, set your Telegram chat ID and choose the SMS provider (`fast2sms` with your API key, or `twilio` with credentials). Set the TomTom key (optional) in the feed's **Settings** node, and the server address in the morning workflow's **Settings**.
2. For SMS replies, pick any long random text as `SMS_KEY` in `server/.env`, and put the same text and the server address in the SMS workflow's **Settings**.
3. Activate the workflows.
4. Paste the production webhook URLs of workflows 1 and 2 into **Staff → Forecast → Automation with n8n** (admin only), or into `server/.env`. In Twilio, set the number's *A message comes in* webhook to workflow 4's production URL (`…/webhook/opd-sms-in`, HTTP POST).

The Express server sends the events, so the browser never needs CORS. Only patients who typed a mobile number get SMS; sample patients have none.

**Events sent:** `registered`, `turn_near`, `token_called`, `no_show`, `sent_to_end`, `moved`, `doctor_status`, `urgent_flag`, `flag_seen`, `demo_patients_added`, `checked_in`, `reports_ready`, `back_with_reports`, `feedback`, `test`.

## API

| | Who | |
|---|---|---|
| `GET /api/state`, `GET /api/stream` | anyone | hospital state and live changes. Staff get everything; others get the queue **without names, ages or phone numbers** |
| `POST /api/actions/:name` | depends on the action | `registerPatient` and `raiseFlag`: anyone. `callNext`, `markNoShow`, `setRoomStatus`: doctor, nurse, admin. `sendToEnd`, `movePatient`, `markFlagSeen`: any staff. `addSamplePatients`, `setSpeed`, `setAutoRun`, `resetAll`: admin. Inputs are validated. |
| `POST /api/auth/login`, `/logout`, `/password`, `GET /api/auth/me` | | staff login |
| `GET/POST /api/staff`, `PUT/DELETE /api/staff/:username` | admin | staff accounts |
| `GET /api/push/key`, `POST /api/push/subscribe`, `/unsubscribe` | patients | phone alerts (web push) |
| `GET /api/stats/learned`, `POST /api/stats/sample`, `DELETE /api/stats` | anyone / admin | what the forecast learned; sample history for the demo |
| `GET /api/conditions` | anyone | weather, air, traffic (cached 15 min) |
| `GET /api/forecast?lang=en` | anyone | forecast summary with a ready-to-send `text` (no patient data) |
| `GET/PUT /api/config`, `GET /api/n8n/log`, `POST /api/n8n/test` | admin | n8n links, hospital location, automation log |
| `GET /api/audit?group=&actor=` | admin | activity log (who did what, and when) |
| `GET /api/my/:pid?secret=` | the patient's own phone | the patient's own record (bill items, receipts) |
| `GET /api/pay/config`, `POST /api/pay/start`, `POST /api/pay/confirm` | the patient's own phone | pay a bill (demo, or Razorpay test/live) |
| `POST /api/pay/webhook` | Razorpay (signed) | payment confirmations from Razorpay |
| `GET/PUT /api/pay/settings`, `POST /api/pay/check` | admin | payment mode and keys (secrets never returned) |
| `POST /api/actions/payBill` (cash), `decideWaiver`, `addCharges`, `refundItem` | staff (refund: admin) | the counter and the doctor |
| `POST /api/ask`, `GET /api/ask/status` | anyone | the voice helper (Gemini if a key is set, else word matching) |
| `POST /api/sms/inbound` | SMS gateway (`x-opd-sms-key`) or staff | an incoming SMS → `{ reply }` |
| `POST /api/demo/setup` | admin | one-click demo day |
| `GET /api/signals` | anyone / staff | local alerts in force (staff also get news suggestions and when the news was read) |
| `POST /api/signals`, `POST /api/signals/:id/accept`, `/dismiss`, `DELETE /api/signals/:id`, `POST /api/signals/news` | staff | add, accept or ignore news, end an alert, read the news now |
| `GET /api/checkin/code` | staff screens | the 6-digit check-in code for the waiting-room screen (changes every 2 minutes) |
| `POST /api/checkin` | the patient's own phone | `{ pid, secret, code }`: a booking (or a missed turn) joins the end of the line; someone back with test reports goes in near the front |
| `POST /api/actions/reportsReady` | any staff | test reports are ready to collect (a message to the patient) |
| `POST /api/feedback` | the patient's own phone | `{ pid, secret, score, reasons }`: "how was your visit?", once, after the doctor |
| `GET /api/telegram` | anyone | `{ bot }`: the Telegram bot's username, for "Alerts on Telegram" links (null without `TELEGRAM_BOT_TOKEN`) |
| `POST /api/actions/recordEmergency`, `setEmergencyFee` | staff / admin | an Emergency visit (after care) and its fee |
| `POST /api/actions/checkIn`, `setArrival`, `setShareLoad` | staff / admin | check someone in at the counter; turn the arrival rule, or the nearby-hospital suggestion, on or off |
| `GET /api/claims`, `POST /api/claims`, `POST /api/claims/:id/step` | staff (see roles above) | PM-JAY claims: list, admit, record a step |
| `POST/DELETE /api/claims/sample` | admin | made-up claims for a demo |

## Security and privacy

- **Passwords** are hashed with scrypt. Logins use a signed, HttpOnly, SameSite cookie that lasts 12 hours. Changing a password ends that person's other sessions. After 5 wrong passwords in a row, login waits a minute.
- **Fair line.**
  - A phone booking holds no place until check-in at the hospital, with a changing code that only staff screens can show.
  - One open token per phone per department, and a cap per internet address.
  - Free care typed on a phone counts only after staff confirm it.
  - The phone id used for the limit is never shown to anyone, staff included.
- **Changes must be sent as JSON**, which stops other websites from using a staff member's login (CSRF).
- **Activity log.** Every staff action, login, failed login and account change is recorded, along with patients' own registrations and urgent alerts. Admins see it under **Activity log** and can filter it or download it as a spreadsheet. It keeps tokens, rooms and places, never names or phone numbers.
- **Patients' names, ages, gender and phone numbers** go only to logged-in staff. A patient's phone remembers its own patient's first name to show it on the slip.
- **PM-JAY claims** are staff-only. The patient's own phone sees only the stage of their own claim. No card, Aadhaar or ABHA number is ever kept.
- **Ask (Gemini)** gets the question, queue numbers and the asker's own place in the line, never a name, and is asked not to store it. Urgent words never reach the AI.
- **SMS** needs the gateway's key; replies never contain names; joining the line by SMS only works from the number on the slip, with the code shown at the hospital.
- **Local news** is read by searching only the town's name; nothing about patients leaves the server. Patients see alert kinds and dates, never staff notes or news links.
- **Data:** no Aadhaar or ABHA numbers, ever. Sample patients have no phone numbers, so n8n can never text a real person by accident.

## What has been checked

- **Logic:** `npm run check` (all of the above).
- **In Chrome**, automated with Playwright on every screen at 360 px with the largest Hindi text, in both server and offline mode, with no console errors:
  - the three-tab flow, and the urgent flag reaching the dashboard in under 30 ms,
  - login and roles, the public queue having no names, and the activity log,
  - learning from history,
  - payments (demo UPI, cash, tests) and PM-JAY claims (admit, record the decision, the patient's phone updating),
  - joining on arrival: a booking is not on the board; scanning the screen code or a counter check-in puts it in the line; the doctor confirms an age at the door.
- **Wider screens:** the same patient screens at 768 px (tablet) and 1280 px (laptop) fit without sideways scrolling, show the top navigation instead of the phone tabs, and lay directions out as tabs (tablet) or side by side (laptop).
- **Layout at every size:** every patient and staff page, each registration step, the help sheet and the staff menu were measured at 320, 360, 390, 768, 1024 and 1440 px, in English and in Hindi at the largest text size. Nothing scrolls sideways, sticks out of its box or is cut off. The waiting-room board fits one screen on a TV (1280×720 up to 1920×1080), shrinking itself a little when needed, since a TV can't scroll.
- **Ask with Gemini.**
  - Tested against a stand-in Gemini client: what is sent (model, rules and facts, schema of real place ids, `store: false`, no names), how answers are read, and every fallback (bad output, over-long answers, API errors).
  - Urgent words never reach Gemini.
  - Live, with a real key and `gemini-3.5-flash-lite`: "X-ray kahan hai?" and a wait question got Hindi answers with the right place in about 2 seconds, and a child's fever went to the Children department. A medicine question got "ask at the help desk", with no advice.
  - Without a key, word matching answers in English, Hindi and Hinglish (logic checks).
- **SMS.** API checks for the gateway key, token status (no names), KAHAN in Hindi, urgent words, and IN only from the slip's number with the screen code. Workflow 4 ran in n8n end to end: a Twilio-style text came back as TwiML.
- **Demo setup and the stage:** one click from the stage in the browser (server and offline), the basic phone's replies, and the API checks for what setup creates.
- **API checks** for Emergency visits:
  - free by default; when a fee is set, it's billed after care
  - free care applies, and paying gives a receipt
  - only admins set the fee
  - no names in public data or the activity log
  - PM-JAY admission works for Emergency patients
- **API checks** for local alerts, with a saved news feed:
  - news from elsewhere or older than a week is left out
  - suggestions don't change the forecast until staff accept them
  - the public view has no notes or links
  - the forecast and morning report list alerts as reasons
  - effects are learned from history, and the early warning fires
- **API checks** for joining on arrival:
  - the code is staff-only, and wrong codes or keys are refused
  - a phone can't skip check-in by saying it is "here"
  - one open token per phone per department, and the per-address cap
  - missed turns rejoin at the end
  - free care typed on a phone waits for staff, but at the counter it counts at once
- **API checks** for payments, and for PM-JAY claims:
  - roles: who can see a claim, move it on and record money
  - every step in order, and wrong steps refused
  - the public queue never showing claims
  - claims surviving a demo reset without attaching to a new patient with the same number
  - no names in the activity log
- **After the doctor** (logic checks, and API checks against a real server with a stand-in for Telegram's API):
  - tests keep the visit open; *reports ready* reaches the phone and Telegram; back with reports by the screen code, by SMS or at the counter goes in after 2 people; yesterday's reports are refused; the public queue never shows which tests
  - feedback only after the visit, once, from the patient's own phone, the slip's number or a following Telegram chat; the public queue only knows it was given
  - Telegram: `/start TOKEN` follows it with no name shown; alerts for called, reports ready, back in the line and "how was it?"; a chat that does not follow a token cannot rate it; a reset ends every follow
  - reports, promised waits and feedback survive a server restart (MongoDB)
  - in Chrome at 390 px in English and Hindi, and on the dashboard and stage: the tests card, the feedback faces and reasons, *Send to family*, *How we did today*, *At tests*, and the new impact tiles, with no console errors
  - not yet tried: a real Telegram bot (the stand-in follows Telegram's API), and the phone's own share menu (only the fallback was shown)
- **Camera QR scan:** a fake camera showing a real slip's QR code opened that patient's turn screen.
- **Phone alerts:** a real Chrome profile subscribed to web push, and Google's push service accepted the server's alert.
- **Voices:** Chrome on macOS has the Hindi (Lekha) and Indian English (Rishi) voices the app uses.
- **n8n:** all four workflows imported and ran in n8n 1.123. The alert routing was confirmed: Telegram for urgent flags, Fast2SMS/Twilio for SMS, a count for everything else. Workflow 4 answered Twilio-style texts (token, `KAHAN`, urgent words, `IN`) with valid TwiML, Hindi included.
- **Production build:** the slim production runtime, with secure cookies behind a proxy and long-term caching of built files.

**Not checked on a real phone:** speaking instead of typing (it needs a microphone and Google's speech service), and how alerts look on an actual Android phone. Try `npm run dev:phone`, or the online version, on a phone.

## Still not production-ready

- **No real hospital system.** There is no HIS/ABDM connection, and no link to the PM-JAY portal (claims are recorded by hand); everything is sample data, and the PM-JAY packages and rates are made up.
- **Your own accounts are needed** for real SMS (Fast2SMS or Twilio), Telegram alerts, live traffic (TomTom, optional), real payments (Razorpay keys; Demo mode works without), and hosting (Render/Atlas or your own server).
- **Fees and free-care rules are samples.** Set your state's real fees and schemes in `client/src/data/fees.js`.
- **Before going live:** a security review, HTTPS everywhere, and regular MongoDB backups.
