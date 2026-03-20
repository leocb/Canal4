# Steps still to be executed in this project

## Must have
- I have not tested it yet, but make sure the ticker can move between connected screen

## Before making the project public
- The permissions screen have some weird behavior and wrong button actions. review.

## Nice to haves:
- Navigation breadcrumbs
- On 7 seconds without heartbeat from display, change the display status to yellow ("Unstable"), then after 17 seconds go to offline. Fix the heartbeat animation to only trigger when a heartbeat is received.
- Self-healing: Add a Connectivity status badge to the spacetimedb on the webapp. use periodic 5 second ping to update the status. if connection is lost (17 seconds with no ping), block the whole webapp screen and show a "Reconnecting..." message. try to reconnect immediately, then every 15 seconds until connection is restored.
- Self-healing: When the desktop app loses connection to the spacetimedb, try to reconnect immediately, then every 15 seconds until connection is restored.
- Enable the option for a node to show only messages of selected channels. move the node "edit name" to a proper edit screen screen and also add the channel select feature there.
- Add Unit testss