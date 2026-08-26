# RideRescue, explained from scratch

These notes assume you know nothing about programming. Every term is explained the
first time it appears. Read top to bottom — each part builds on the one before.

---

## Part 1 — What problem does this solve?

Imagine you are riding your scooter and it breaks down on the roadside. Today you
would have to:

- Ring people you know and ask if they have a mechanic's number
- Describe where you are, badly, over the phone
- Wait, with no idea whether anyone is coming or how long it will take
- Argue about the price afterwards

**RideRescue turns that into one button.** You press it, the app finds the nearest
available mechanic automatically, and you watch them travel towards you on a map,
the way you watch a food delivery.

It also does two other things:

- **Book a service in advance** — a normal servicing appointment, not an emergency
- **Buy spare parts** — an online shop for bike parts, delivered to you

That is the whole product. Everything else in these notes is *how* it works.

---

## Part 2 — How any app like this works

This is the most important idea in the whole project. If you understand this part,
the rest is detail.

Think of a **restaurant**:

| Restaurant | Software | What it means |
|---|---|---|
| The dining room | **Frontend** | What the customer sees and touches |
| The kitchen | **Backend** | Where the real work happens, out of sight |
| The pantry | **Database** | Where everything is stored |
| The waiter | **API** | Carries orders to the kitchen and food back |

**You never walk into the kitchen.** You tell the waiter what you want, the waiter
takes it to the kitchen, the kitchen makes it, the waiter brings it back. You have
no idea what happened in there — and you do not need to.

That separation is deliberate. It means:

- The kitchen can be rebuilt without changing the dining room
- One kitchen can serve several dining rooms — which is exactly what happens here,
  because RideRescue has a website *and* a phone app, both talking to the same kitchen
- A customer cannot reach into the pantry and help themselves

**Now the real words:**

- **Frontend** — the part on your screen. Buttons, maps, text. Also called the *client*.
- **Backend** — a program running on a computer somewhere else, that does the thinking
  and remembers things. Also called the *server*.
- **Database** — an organised store of information. Think of a set of filing cabinets.
- **API** — the list of things you are allowed to ask the backend to do. Like a menu:
  you can order what is on it, and nothing else.

---

## Part 3 — The three apps

RideRescue is not one program. It is three, and they all talk to the same backend.

**1. The website** (works in any browser, on a laptop or phone)
Used by all four kinds of people. This is where the admin and the shop owners work.

**2. The Android app** (installed on a phone)
Used by customers and mechanics. It exists because a phone can do things a website
cannot do well: know your exact location using GPS, and stay open in your hand while
you ride.

**3. The backend** (you never see this one)
Runs on the internet, day and night. Both the website and the phone app send it
questions and it answers them. It is the only thing allowed to touch the database.

> **Why not just build one app?** Because a website cannot reliably use a phone's GPS
> while the screen is off, and a phone app is a poor place to read a big table of
> business figures. Each one does what it is good at.

---

## Part 4 — The four kinds of people

The project calls these **roles**. A role decides what you are allowed to see and do.

**🧑 Customer** — the rider. Presses the emergency button, books services, tracks the
mechanic, buys parts, pays.

**🔧 Mechanic** — receives jobs, travels to the customer, does the repair, gets paid.

**🏪 Vendor** — a spare parts shop. Lists parts for sale, manages stock, fulfils orders.

**🛡️ Admin** — the person running the whole platform. Sees every user, every booking,
all the money, and can block someone who misbehaves.

**Everyone uses the same app**, and it looks completely different depending on who
you are. A customer signing in sees an emergency button; a mechanic signing in sees a
list of jobs. That is the role deciding what to show.

---

## Part 5 — One complete story, step by step

This is the demo. Follow it slowly — it ties everything together.

### The setup

Nawaz's scooter has broken down. He has the app. Basha is a mechanic about a kilometre
away, with his app open and marked as "available".

### Step 1 — Nawaz presses SOS

He presses and holds the big red button for two seconds.

> **Why hold it?** So it cannot be pressed by accident in a pocket. Sending a real
> mechanic to the wrong place wastes their fuel and time.

His phone reads its GPS position — a pair of numbers describing exactly where he is on
Earth. It sends those numbers to the backend along with "emergency, this is my bike".

### Step 2 — The backend finds the best mechanic

This is the clever part, and it happens in under a second.

The backend asks the database: *"which mechanics are available and within 20 kilometres
of these coordinates?"* The database can answer that quickly because it stores locations
in a special way designed for exactly this question (more on that in Part 7).

Suppose four mechanics come back. Which one gets the job? The backend gives each a
score out of 1, built from five things:

| What is measured | Why it matters |
|---|---|
| How far away they are | The biggest factor in an emergency |
| Their star rating | Past customers' opinion |
| Whether they are free right now | Someone mid-job will be slower |
| Years of experience | A harder repair needs a better mechanic |
| How many jobs they already have | Do not overload one person |

The highest score wins. In a real booking on the live system, Basha scored **0.7674**
and was assigned in **under one second**.

The system also records *why*, in plain English: *"Only 0.4 km away · 5 years experience
· Free right now."* That matters — a system that just says "trust me" is much harder to
defend than one that shows its reasoning.

### Step 3 — Basha's phone lights up

The job appears on his screen instantly. Not because his phone keeps asking "any jobs?
any jobs?" every few seconds, but because of something called a **socket** — explained
in Part 6. For now: think of it as a phone line that stays open, so either side can
speak the moment they have something to say.

He taps **Accept**.

### Step 4 — Nawaz watches him coming

Now the map on Nawaz's screen shows two markers:

- A **red teardrop pin** — Nawaz (marked **C** for customer)
- A **blue circle** — Basha (marked **M** for mechanic)

As Basha rides, his phone sends its position every few seconds. The backend works out
how far apart they are, calculates an estimated arrival time, and pushes both to
Nawaz's screen. The blue marker moves. The ETA counts down.

> **Be honest about this if asked:** the distance is measured in a straight line, not
> along the roads. Real road distance would need a separate mapping service. It is the
> obvious next improvement.

### Step 5 — Basha arrives, and proves it is really him

Here is a problem worth thinking about: how do you stop a dishonest mechanic from
marking a job "done" without doing anything, and charging for it?

RideRescue's answer: when the job is created, the system generates a **four-digit code**
and shows it only to the customer. The mechanic cannot start the work until the customer
reads that code out and he types it in.

That single step means the mechanic must physically be standing next to the customer.
No code, no job, no payment.

### Step 6 — The work happens, then payment

Basha marks the job complete. The bill is calculated **on the backend**, never on the
phone.

> **Why does that matter?** If the phone worked out the price, a dishonest person could
> tamper with their own phone and pay ₹1 instead of ₹799. Because the backend calculates
> it, the phone's opinion about price is simply ignored.

Nawaz pays through **Razorpay**, a real Indian payment company. He picks a payment
method, Razorpay's own secure screen opens, and he pays. RideRescue never sees his card
details — they are typed into Razorpay's page, not ours.

### Step 7 — Rating

Nawaz gives Basha a star rating. That rating feeds back into the scoring in Step 2, so
good mechanics get more work over time.

**That is the entire flow.** Everything else in the app supports it.

---

## Part 6 — The technologies, one by one

Each one below: what it is, and why this project uses it.

### JavaScript
The programming language everything here is written in. It is the language web
browsers understand, and it can also run on servers — which is why the whole project
uses one language instead of two.

### Node.js
A tool that lets JavaScript run on a server instead of only inside a browser. Without
it, the backend would have to be written in a different language.

### Express
A helper for Node that makes it easy to say *"when someone asks for this, do that."*
For example: "when someone asks for `/api/bookings`, give them their bookings."

Those addresses — `/api/bookings`, `/api/payments` and so on — are called **endpoints**.
RideRescue has thirteen groups of them: auth, profile, services, bookings, parts,
orders, vendor, payments, mechanic, notifications, assistant, admin, support.

### MongoDB
The database — where all the information lives permanently. If the server is switched
off and on again, everything is still there, because it is in the database and not in
the server's memory.

**Why this database and not a traditional one?** Because of one question the app asks
constantly: *"who is near me?"* MongoDB can answer that directly and quickly. Most
traditional databases would need extra machinery bolted on.

### Socket.IO
The "phone line that stays open" from Step 3.

Normally the internet works like sending letters: you ask a question, you get an answer,
the connection closes. That is fine for most things, but useless for live tracking —
you would have to keep asking "where is he now?" every three seconds, which is wasteful
and still feels slow.

A socket keeps the line open, so the server can speak first. When the mechanic moves,
the customer's screen updates immediately, without asking.

RideRescue uses it for three things: **live location**, **chat** between customer and
mechanic, and **notifications**.

### Next.js and React
The tools the website is built with. React is a way of building screens out of reusable
pieces; Next.js adds page organisation and speed on top.

### React Native and Expo
The tools the Android app is built with. The clever part: React Native lets you write
the phone app in the same language and style as the website, instead of learning a
completely separate one.

### Firebase
Google's service, used here for one job: **sending the OTP** — the six-digit code you
receive by text message when you sign up.

**Why not send the text ourselves?** In India, sending commercial SMS legally requires
registering with the telecom regulator (TRAI) as a business, which a student project
cannot do. Firebase sidesteps it because **Google** is the registered sender, not us.

### Razorpay
The payment company. Used in **test mode**, which is free — it behaves exactly like the
real thing but no actual money moves.

---

## Part 7 — Where all the information is kept

The database holds twelve **collections**. A collection is like one filing cabinet, and
each item in it is one document — one person, one booking, one payment.

| Collection | What is in it |
|---|---|
| **User** | Every person: customers, mechanics, vendors, admin. Their name, phone, role, location, and their bikes |
| **Booking** | Every job. Who, which mechanic, what service, the status, the price |
| **ServiceType** | The menu of services — general service, puncture repair, and so on |
| **SparePart** | Every item in the shop |
| **Order** | Every parts purchase |
| **Payment** | Every payment attempt, successful or not |
| **Review** | Star ratings customers leave |
| **Message** | Chat messages between customer and mechanic |
| **Notification** | Alerts shown in the bell icon |
| **Complaint** | Problems raised for the admin |
| **Coupon** | Discount codes |
| **Otp** | Temporary sign-up codes, deleted automatically once expired |

### The one clever bit: the geospatial index

An **index** is like the index at the back of a textbook. Without it, finding a topic
means reading every page. With it, you jump straight there.

RideRescue puts a special kind of index on people's locations, called a **2dsphere
index**. "2dsphere" means it understands the Earth is a ball, not a flat sheet — so
distances are correct.

This is what makes *"find available mechanics within 20 km, nearest first"* fast even
with many users. Without it, the database would have to measure the distance to every
single mechanic, one at a time.

**One detail that trips everyone up:** locations are stored as `[longitude, latitude]`
— in that order. Everyone says "latitude and longitude" out loud, so the reversed order
is a classic mistake. Get it backwards and your mechanic appears in the sea.

---

## Part 8 — The "AI", explained honestly

The project has four AI features. Before describing them, the honest framing, because
this is the thing most likely to be challenged:

> **These are not neural networks.** They are scoring systems built from clear rules.
> That was a deliberate choice, and there are good reasons for it.

**Why rules instead of a learned model?**

1. **A learned model needs training data.** To teach a computer to pick good mechanics,
   you would need thousands of past bookings with known outcomes. A new project has none.
2. **You can explain a rule.** The app can say *"chosen because 0.4 km away and free
   right now."* A neural network cannot tell you why it decided anything.
3. **It works from day one**, with no waiting and no data collection.

Saying this yourself is far stronger than being caught out by it.

### The four features

**1. Mechanic matching** — the scoring from Step 2. Five factors, weighted. The weights
*change* for an emergency: distance jumps from 32% to 50% of the decision, because when
you are stranded, who arrives soonest matters more than who has the best reviews.

**2. Parts recommendation** — suggests parts that fit *your specific bike*, based on
your make and model and what similar bikes have needed.

**3. Predictive maintenance** — predicts when each part of your bike is due for
attention. It uses two measures and takes whichever comes first: **distance ridden** and
**time passed**. That mirrors how real manufacturers write service schedules — "every
3,000 km or 6 months, whichever is sooner".

**4. Chatbot** — answers common questions. It looks at the words you typed, works out
which of nine topics you mean, and then **looks up your real data** to answer. Ask
"where is my mechanic" and it tells you the actual current ETA, not a canned reply.

---

## Part 9 — How the app stays safe

Each of these is worth understanding, because "is it secure?" is a guaranteed question.

**Passwords are never stored.** When you set a password, it is put through a one-way
scrambler called **bcrypt**. The scrambled result is stored. Scrambling is one-way —
you cannot unscramble it. When you log in, your typed password is scrambled again and
the two scrambles are compared. Even someone who steals the entire database cannot read
anyone's password.

**Logging in gives you a token.** After you sign in, the server hands your app a signed
pass called a **JWT**. Your app shows it with every request afterwards, like a wristband
at a festival. It is signed, so it cannot be forged, and it expires after seven days.

**Your role limits what you can reach.** A customer's token simply cannot open the admin
pages. The server checks on every single request.

**Owning the right role is not enough.** A customer cannot read *another* customer's
booking, even though both are customers. The server checks that the booking is actually
yours. This distinction — *role* versus *ownership* — is the single best security point
to make.

**Your phone number is proved, not claimed.** Anyone can type any phone number into a
form. So the app never trusts it: Firebase sends the code, checks it, and gives back a
signed certificate that the number is yours. The backend verifies that signature before
creating the account.

**Payments are verified with maths.** When Razorpay reports "this was paid", it includes
a **signature** — a code that could only be produced by someone holding our secret key.
The backend recalculates it and compares. If it does not match, the payment is marked
failed. So a fake "I paid, honest" message from a phone is rejected.

**Prices are always recalculated on the server.** Covered in Step 6 — the phone's
opinion about money is ignored entirely.

### Being honest about the weaknesses

Naming your own limitations makes you look like an engineer. Being caught out by them
does the opposite.

- The login token is stored in the browser where JavaScript can read it. A stricter
  method exists but complicates the phone app.
- There is no limit on login attempts, so someone could keep guessing passwords. A
  standard tool fixes this and would be the first thing to add.

---

## Part 10 — Words you will hear

| Word | Plain meaning |
|---|---|
| **Frontend / client** | The part you see and touch |
| **Backend / server** | The program doing the work, elsewhere |
| **Database** | Where information is stored permanently |
| **API** | The list of things you may ask the backend to do |
| **Endpoint** | One specific thing you can ask for, like `/api/bookings` |
| **Request** | Asking the backend something |
| **Response** | Its answer |
| **Deploy** | Put it on the internet so anyone can use it |
| **Repository / repo** | The folder holding all the code, with its history |
| **Commit** | One saved change, with a note explaining it |
| **JWT / token** | Your proof of being logged in |
| **Socket** | A connection that stays open so the server can speak first |
| **Index** | A shortcut that makes searching fast |
| **Collection** | One filing cabinet in the database |
| **OTP** | The one-time code sent by text |
| **Geospatial** | To do with positions on Earth |
| **GPS coordinates** | Two numbers giving an exact spot |
| **Latitude** | How far north or south |
| **Longitude** | How far east or west |
| **ETA** | Estimated time of arrival |

---

## Part 11 — If someone asks you a question

Short answers you can give confidently.

**"What is this project?"**
An app that connects a stranded two-wheeler rider with the nearest available mechanic,
tracks that mechanic live on a map, and sells spare parts alongside it.

**"Who uses it?"**
Four kinds of people: customers, mechanics, spare parts vendors, and an administrator.
Each sees a completely different app.

**"How does it find the nearest mechanic?"**
The database stores everyone's position with a special index for location questions, so
it can quickly find mechanics within 20 km. Those are then scored on distance, rating,
availability, experience and current workload, and the best one is assigned.

**"How does the live tracking work?"**
The mechanic's phone sends its position every few seconds over a connection that stays
open, so the customer's map updates immediately rather than the app having to keep
asking.

**"Is it really AI?"**
It is an explainable scoring system, not a neural network — deliberately. It can justify
every decision in words and works without any training data. A learned model would be
the next step once there are enough completed bookings to learn from.

**"Is it secure?"**
Passwords are scrambled one-way and never stored. Logging in gives a signed token that
expires. Your role limits what you can reach, and separately, you can only see records
that are actually yours. Payments are verified by a cryptographic signature, and prices
are always recalculated on the server.

**"What would you improve?"**
Real road distances instead of straight lines, a limit on login attempts, and a learned
ranking model once there is enough real booking data to train one.

---

## The one thing to remember

If you remember nothing else:

> **The phone and the website are just screens. The backend does the thinking and the
> database does the remembering. Everything the app does is one of those three, talking
> to the other two.**
