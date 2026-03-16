# Steps still to be executed in this project

1. Add Email login pin (valid for 10 minutes) using a SMTP provider, configured through the .env file (host,port,user,password,from)
2. Logins are valid for 30 days. After 30 days, the user needs to login again using the email pin method. Everytime the user open the app and login again, the expiration is extended for another 30 days.
3. The permissions screen have some werid behavior. review.
6. fix the ticker having margins around it (it's not filling the whole desktop width and it has a margin at the bottom too?)
7. fix the ticker not being transparent
8. fix the color picker in the settings not having a alpha value
9. I have not tested it yet, but make sure the ticker can move between connected screens
11. enable the option for a node to show only messages of selected channels. move the node "edit name" to a proper edit screen screen and also add the channel select feature there.
14. Internally, change "delete message" to only hide the message (don't actually delete it) - this is so admins and owners can still review deleted messages in the logs. Add "Cancelled" as a message status, don't forget to update the code for the message status badges too.
13. make the display node ticker immediately stop displaying a message when it's deleted (hidden).
15. Create the installer for the desktop app
16. Create a docker container to deploy the web app
17. Create docker compose file to spin up the web app and the spacetime database
18. Remove default values from all apps (remove from things that are configurable, like database host or .env values) - create env values to facilitate the dev environment
20. Add internationalization to the whole app: Move all the message/button/text strings to a json file compatible with weblate. Add a way to switch between languages (English and Brazillian Portuguese) - also add language detection for the user and automatically load the most appropriate language
21. Transalte all the string to Brazillian Portuguese
22. Rebrand the App to "Canal4". Change all relevant strings
23. Rename the desktop App to "Canal4 Display node". Change all relevant strings