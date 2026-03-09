# About this project

This project is a Notification send service that uses SpacetimeDB for real time communication, a react website/PWA for Sending and managing channels and finally electron app to display messages.

## Software parts

- App: a Website/PWA React app for managing venues and channels
- Messenger: an Desktop Electron app for displaying messages
- API: SpacetimeDB for real time communication

## Roles

- Owner: Complete Access to manage everything. Multiple owners may exist.
- Admin: Can manage channels/venues (Users and Permissions, channel settings), on venues admin may create new channels
- Moderator: Can send and delete messages.
- Channel Member: Can only view messages.

More permisseve roles have the same capabilities of lower permission roles

## Workflow

0. A user creates an account/logs in the app using a 3rd party OAuth provider (Can be Google or Apple)
1. A user, using the app, creates a new Venue. The user is now the "Owner" of this venue and have complete access to manage it
2. The user can register a new "Message Display" (Electron App) to this venue. This will be used to display messages on a screen.
3. On the venue, the user creates a new Channel. The user is now the "Owner" of this channel and have complete access to manage it. Each channel can have one or more templates, that are used to send messages
4. The user can invite other users to the venue/channel as "Admin", "Moderator" or "Member". The invitation is a link that the user can share with others. The link is valid for 10 minutes. The link is also show as a QRCODE that can be scanned inside the app by other users to join the venue/channel
5. The users with appropriate permissions can send messages to the channel, using templates
6. All channel members can view the messages. The user may allow the browser/app to send notification to their phones. Members may also filter notification they received by message content, allowing only messages that contain a certain string to send notifications.


## How it works

### The messenger desktop app

- The messenger is an desktop app that connects to a channel and show messages on a screen.
- It uses SpacetimeDB to receive messages in real time. The app is built using Electron and React.
- It uses the SpacetimeDB React SDK to connect to the SpacetimeDB database.
- It can receive multiple messages at once, it enqueues the message to be shown one after another
- It's identified by a UID created when the app first loads, saved in the windows registry, this ID is sent to spacetime db when needed. The ID can be renewed if necessary (dangerous! resets all connections!)
- It can connect to several venues and show messages from multiple channels at once. The connection is stabilished as follows:

#### Connecting the messenger to a venue

1. On the app, the user configures a new display, give it a name, then the app asks for the 6 digit pin from the messenger
2. On the messenger, the user click on "Register new Venue" a 6 digit PIN is created and is valid for 10 minutes
3. The user enters the 6 digit PIN on the app
4. The app connects to the SpacetimeDB database and retrieves the venue information
5. The app shows the venue information on the screen and asks for confirmation, OK saves that venue on the app and on the database

#### Screens

The messenger app usually have no screen visible, it runs in the background with a icon on the taskbar notification section. Clicking on it shows a menu with 2 screens the user can open: "Log" and "Settings". A third screen "message display" window is used to show the messages when one is received.


##### Message Display Screen

This shows the messages received from the connected venue/channel. This screen is a no-border window that shows up in a specified screen, on the top or bottom, the width fills the screen. It's always on Top. The user cannot move it. It should be semi-transparent if possible. This screen is completely controlled by the app, the user cannot interact with it.

Behavior:
- When a message is received, this screen is shown
- The message is displayed on the screen
- The message text scrolls sideways, like a TV news ticker: screen is shown blank, The text appears on the right and scrolls to the left, until it completely exists the screen, leaving it blank again.
- If more messages are enqueued, the next one is now shown as above


##### Log Screen

This screen displays the following information:
- Connection status with the spacetime db
- The venues it's connected to
- A list of the last 20 messages received, with the most recent one at the top, with a "load more" at the bottom. Changes in date day create a separator
    - The message format on the list is: [Timestamp] - [Venue] - [channel] - [user name that sent it] (linebreak) [message]
- When an error occurs, this screen is also shown (without the user having to open it manually) with the error logged as a message in red. a app notification is also sent to the venue owner
    - Format: [Timestamp] - [Venue] - [channel] - [error message]
    - The notification is sent to the venue owner using the SpacetimeDB React SDK

##### Settings Screen

This screen allows for the customization of the following:
- Spacetime DB connection settings
- computer display the messages will be shown at
- position on the display (top or bottom)
- message font family, size, weight, background and foreground color
- scroll speed
- how many times to repeate each message

### The App - React website/PWA


