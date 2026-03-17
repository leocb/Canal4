# About this project

This project is a Notification send service that uses SpacetimeDB for real time communication, a react website/PWA for Sending and managing channels and finally electron app to display messages.

## App Name

Courier Notifications

## Software parts

- App: a Website/PWA React app for managing venues and channels
- Display: an Desktop Electron app for displaying messages
- API: SpacetimeDB for real time communication

## Roles

- Owner: Complete Access to manage everything. Multiple owners may exist.
- Admin: Can manage channels/venues (Users and Permissions, channel settings), on venues admin may create new channels
- Moderator: Can send and delete messages.
- Member: Can only view messages.

Roles are per-channel

More permisseve roles have the same capabilities of lower permission roles

## Workflow

0. A user creates an account/logs in the app using a 3rd party OAuth provider (Can be Google or email)
1. A user, using the app, creates a new Venue. The user is now the "Owner" of this venue and have complete access to manage it
2. The user can register a new "Message Display" (Electron App) to this venue. This will be used to display messages on a screen.
3. On the venue, the user creates a new Channel. The user is now the "Owner" of this channel and have complete access to manage it. Each channel can have one or more templates, that are used to send messages
4. The user can invite other users to the venue as "Member" (initial role). The invitation is a link that the user can share with others. The link is valid for 10 minutes. The link is also show as a QRCODE that can be scanned inside the app by other users to join the venue. members can view all channels in a venue marked as "members" access level,
5. The users with appropriate permissions can send messages to the channel, using templates
6. All channel members can view the messages. The user may allow the browser/app to send notification to their phones. Members may also filter notification they received by message content, allowing only messages that contain a certain string to send notifications.

## The Database

1. Verify what's needed for the database to work as intended for this app
2. Write a detailed doc of how the database will work in conjunction with the apps

## How it works

### Email

- We'll use the SMTP2GO web service to send emails

### Notifications

- We'll use Firebase for sending push notifications

### The display desktop app

- The display is an desktop app that connects to a channel and show messages on a screen.
- It uses SpacetimeDB to receive messages in real time. The app is built using Electron and React.
- It uses the SpacetimeDB React SDK to connect to the SpacetimeDB database.
- It can receive multiple messages at once, it enqueues the message to be shown one after another
- It's identified by a UID created when the app first loads, saved in the windows registry, this ID is sent to spacetime db when needed. The ID can be renewed if necessary (dangerous! resets all connections!)
- The display UID can be used to authenticate this instance again when the app opens a second time (treat it as a access token)
- The display does not show messages that were sent prior to its *initial* connection and registration to the database. However, if the app is already registered and temporarily loses connection, upon reconnecting it will fetch and display any messages sent while it was disconnected. The app should be as self-healing as possible, managing its own reconnection and syncing gracefully.
- It can connect to several venues and show messages from multiple channels at once. The connection is stabilished as follows:

#### Connecting the display to a venue

1. The user navigates to a Venue, then clicks the "View Desktop Displays" button at the bottom of the channel list. Only Admins and Owners can see this button.
2. In the "Desktop Displays" screen, the app displays a list of the currently connected nodes. At the bottom, a form helps to pair a new node.
3. On the display, the user click on "Register new Venue" a 6 digit PIN is created and is valid for 10 minutes
4. The user enters the 6 digit PIN on the app form under "Pair New Display"
5. The app connects to the SpacetimeDB database and retrieves the venue information
6. The app shows the venue information on the screen and asks for confirmation, OK saves that venue on the app and on the database

#### Screens

The display app usually have no screen visible, it runs in the background with a icon on the taskbar notification section. Clicking on it shows a menu with 2 screens the user can open: "Log" and "Settings". A third screen "message display" window is used to show the messages when one is received.


##### Message Display Screen

This shows the messages received from the connected venue/channel. This screen is a no-border window that shows up in a specified screen, on the top or bottom, the width fills the screen. It's always on Top. The user cannot move it. It should be semi-transparent if possible. This screen is completely controlled by the app, the user cannot interact with it.

Behavior:
- When a message is received, this screen is shown
- The message is displayed on the screen
- The message text scrolls sideways, like a TV news ticker: screen is shown blank, The text appears on the right and scrolls to the left, until it completely exists the screen, leaving it blank again.
- If more messages are enqueued, the next one is now shown as above
- Message displayed status (enqueued, in progress, shown) is synced back to the sapcetimedb

##### Log Screen

This screen displays the following information:
- Connection status with the spacetime db
- The venues it's connected to
- A list of the last 20 messages received, with the most recent one at the top, when scrolling to the bottom, the app fetches the next 20 messages. Changes in the message date "day" create a separator
    - The message format on the list is: [Timestamp] - [Venue] - [channel] - [template] - [user name] (linebreak) [message]
- When an error occurs, this screen is also shown (without the user having to open it manually) with the error logged as a message in red. a app notification is also sent to the venue owners:
    - Format: [Timestamp] - [Venue (if applicable)] - [channel (if applicable)] - [error message]

##### Settings Screen

This screen allows for the customization of the following:
- Spacetime DB connection settings
- computer display the messages will be shown at
- position on the display (top or bottom)
- message font family, size, weight, background and foreground color
- scroll speed
- how many times to repeate each message

### The App - React website/PWA

- This app is used by users to manage venues, channels and other user, also to send messages and moderate them. members can view messages and receive notifications about them
- Each user must create an account or login via Google or email

#### Screen layout descriptions

The following is an overview of the screen layout and how they should work

##### Log-in Screen

- When following am invitation link to a Venue, the app must first ask for the user to log-in if he's not already.
- After logging in, and completing the first time setup, the user is redirected to the invitation link
- A simple login screen with the app name on top
- Centered on the screen, Two buttons on a vertical layout follows: Sign-in with Google, Sign-in with Email/Passkey
- If it's the first time the user is logging in (new user), the app must then ask for their name (that will be used throught the app)
- Copyright notice at the very bottom "Copyright github.com/leocb" - touching this navigates to the github page

###### Sign-in with Google button

- The user is forwarded to google Oauth process
- Upon successful login, if the user does not exist in the database, a new user is created and linked to the oauth login
- User is now logged in the app

###### Sign-in via email/passkey button

- The user is directed to a new screen
- The screen has the app name on top
- Below the app name, the text "Sign-in via email" appears
- Centered on screen, a text box is shown for the user to specify which email they want to use
- A "Sign-in" button appears below the text box
- The app will prompt to authenticate using an existing passkey (WebAuthn).
- If the passkey authentication succeeds, the user is logged in immediately.
- If the passkey authentication fails or no passkey exists:
  - If the user does not exist in the database, a new user is created and linked to the email
  - A 6-digit PIN is sent to the email, and is valid for 10 minutes
  - The user is directed to a new screen
  - A 6-Digit text box is shown on screen
  - A "Confirm" button appears below the text box
  - The user needs to type the 6-digit PIN they received in the email to log-in
  - User is now logged in the app
  - After logging in via email, the app should offer to register a passkey for future easier sign-ins.

###### Completing the first time log-in

- The user is directed to a new screen
- The screen has the app name on top
- Below the app name, the text "What should we call you?" appears
- Centered on screen, a text box is shown for the user to specify which name they want to use
- A "Confirm" button appears below the text box
- The user is directed to the next screen: Venues List

##### Venues List Screen

- The screen has the app name on top
- Centered on screen, a list of venues is shown in alphabetical order, max 50
- Tapping on a venue name opens the next screen: Channel List
- A "New Venue" button appears at the top right of the screen. If no venues exist, this button is shown front and center
- When scrolling to the end of the list, the app fetches the next 50 venues and appends them to the list
- A "Three dots" menu is available in the top right, the options in that menu are: Logout
- Choosing logout closes all sessions of this user in this device and forwards the user to the login screen

##### Venue - Channel List Screen

- The screen has the venue name on top
- A "Back" button appears at the top left
- Centered on screen, a list of channels is shown in alphabetical order, max 50
- Tapping on a channel name opens the next screen: Channel
- When scrolling to the end of the list, the app fetches the next 50 channels and appends them to the list
- A "New Channel" button appears at the top right of the screen. If no channels exist, this button is shown front and center
- A "Three dots" menu is available in the top right, the options in that menu are: Venue Settings, Permissions, Invite, Notifications, Leave Venue (Simple Yes/No Confirmation)
- If the user is the only Owner of the venue, they cannot leave the venue, they must first promote another member to Owner, or delete the Venue entirely.
Permissions: Only Owners can create new channels and admins, Admins can add new moderators, moderators have the same permissions as members in this screen

###### Venue - Channel List - "Venue Settings" Screen

- Owners only
- A screen for configuring the venue is shown
- At the top "[Venue name] Settings" is shown
- A "Back" button appears at the top left
- A "Venue Name" text box is shown, centered on screen
- A "Confirm" button appears below the text box
- If the user is the owner, a "Delete Venue" button appears at the top right, requires confirmation by re-typing the venue name

###### Venue - Channel List - "Permissions" Screen

- Owners and Admins only
- A screen for managing members permissions is shown
- At the top "[Venue name] Permissions" is shown
- A "Back" button appears at the top left
- Centered on screen, a list of members is shown in alphabetical order, grouped by role (owner, admin, moderator, member), max 50
- Tapping on a member name opens the next screen: Member
- When scrolling to the end of the list, the app fetches the next 50 members and appends them to the list

###### Venue - Channel List - "Permissions" Screen - "Member" sub screen

- Owners and Admins only
- A "Back" button appears at the top left
- A screen for managing a member permissions is shown
- At the top "[Venue name] Permissions" is shown
- The member info is shown: User Name, join date, last seen
- If the user is banned, a "Unban" button is shown (simple yes/no confirmation); Only Admins and Owners can unban
- A button to view the user's last message is shown
- A dropdown to select the user role in the venue is shown
- Then, a list with all the channels is shown, on the left the channel name, on the right the channel role

###### Venue - Channel List - "Invite" Screen

- A screen to invite others to the current venue is shown.
- A "Back" button appears at the top left
- On the screen are:
- the invitation URL
- the share button for sending the link via other apps
- a QR-Code that can be scanned (link)

###### Venue - Channel List - "Notifications" Screen

Screen for managing notifications of that channels is shown
- User can: Enable All, Disable All, Only filtered text
- A textbox for the user to enter the filtered text is shown, can be several texts, comma separated texts. If a message is received and contains any of the texts in the filter, then the user is notified.
- A "Ask for notification permission" is requested if the user enables notifications and the device is not yet authorized to receive notifications from the website/PWA.

###### Venue - Channel List - "Desktop Displays" Screen

- Owners and Admins only
- A screen for viewing and pairing desktop displays is shown
- At the top "[Venue name] Desktop Displays" is shown
- A "Back" button appears at the top left
- Centered on screen, a list of current display nodes connected to this venue is shown
- At the top right of the screen header, an "Add Node" button directs the user to a standalone screen to enter a Node Name and the 6-digit PIN from the Electron app.

##### Channel Screen

- Channels are accessed by ID. Venue URLs are represented by a random 2-word passphrase (e.g. `fast-bunny`) instead of an ID. If a collision occurs, additional words are added.
- The screen has the channel name on top
- A "Back" button appears at the top left
- Centered on screen, a list of messages is shown in reverse chronological order, max 50, default message max age for members: 4 hours old (configurable), no max age for moderators and above
- "No new messages" is shown when the message list is empty
- Moderators can send messages to the channel by pressing on the "Send Message" button, the user then selects which template to use to send the message
- Moderators or above users can also moderate messages, deleting them and/or blocking users (demoting them to Member unconditionally). Admins then can review blocks (with attached message) and unblock users.
- A "Three dots" menu is available in the top right, the options in that menu are: Channel Settings
- Long pressing a message show context menu: Display Again, Delete, Delete & Block, View info
- Displaying the message again creates a copy of it (like a new one was sent), and displays it in the desktop app too. Repeats of the same message as the latest one displays how many times it was repeated in a badged (group repeats on the UI only, in the backend it should work as new sends)
- Deleting a message immediatly stops it being displayed in the desktop app, if it's in progress or queued
- View info displays the whole message information: Who sent it, when, in progress/shown/queued
- Moderators and above can see the message display status icon (enqueued, in progress, shown)
- If more than one Display is connected to the venue, one status icon is displayed per connected display
- Permissions: Owners can do anything, Admins may add new Moderators and can block users, but not change settings. Moderators may moderate messages and send messages, but can't block, Members may only view messages.
- Blocked users are forcefully demoted to the permissions of a member across all channels of the venue. They cannot be "promoted" again (e.g., to moderator) until an Admin releases the block.

###### Channel Screen - "Channel Settings" Screen

- Owners only
- A screen for configuring the channel is shown
- At the top "[Channel name] Settings" is shown
- A "Back" button appears at the top left
- A "Channel Name" text box is shown, centered on screen
- A "Channel Access: Drop down is shown, listing all the roles, the channel then can be viewed by all member with the selected role or above.
- A "Configure templates" button appears below the text box
- A "Confirm" button appears below the text box
- If the user is a owner, a "Delete Channel" button appears at the top right, requires confirmation by re-typing the channel name

###### Channel Screen - "Channel Setting" - "Templates" list Screen

- Owners only
- A screen for configuring the templates is shown
- At the top "[Channel name] Templates] is shown
- A "Back" button appears at the top left
- The list of templates is shown, tapping on one opens that template for editing
- A "new Template" button is available on the top right

###### Channel Screen - "Channel Setting" - "Templates" Screen - New/Edit

- Owners only
- A screen for configuring the tempaltes is shown
- At the top "Edit Template" or "New Template" is shown
- A "Back" button appears at the top left
- A message template consists of a Name, Description and Fields:
- An example of the final output of the template is shown
- A "Name" textbox is shown
- A "Description" textbox is shown
- Each field can have a text before and after that field value.
- Each field needs to have a regex to validate the value
- Each field can have an alternate text before and after that field value, based on a alternate text detection via another regex
- A Field can be numeric only
- A Field may be optional (no regex)
- Each template can have multiple fields
- Fields can be reordered (touch and drag)
- Fields can be removed
- Add new field is shown at the bottom

###### Channel Screen - "Send message" Button

A screen for sending messages is shown
- Moderators, Admins, Owners only
- User first selects which message template to use. If only one is available, skip this
- User fills in all the fields of that template
- A preview of the message is displayed at the bottom
- A "Send" is shown at the bottom
- If no display is currently available, ask the user if they want to send the message anyway
- When sending the message, the template is collapsed into a single string and then sent to the database.
- Sending successful: show a message on full screen then return to the channel screen after a few seconds.



