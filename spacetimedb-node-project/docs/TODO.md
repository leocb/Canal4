# Steps still to be executed in this project

## Must have
- The permissions screen have some weird behavior. review.
- I have not tested it yet, but make sure the ticker can move between connected scree-
- Create the installer for the desktop app (mac (intel and apple silicon) & windows)
- Create a docker container to deploy the web app
- Create docker compose file to spin up the web app and the spacetime database
- Remove default values from all apps (remove from things that are configurable, like database host or .env values) - create env values to facilitate the dev environment
- Add internationalization to the whole app: Move all the message/button/text strings to a json file compatible with weblate. Add a way to switch between languages (English and Brazillian Portuguese) - also add language detection for the user and automatically load the most appropriate language
- Transalte all the string to Brazillian Portuguese
- Rebrand the App to "Canal4". Change all relevant strings
- Rename the desktop App to "Canal4 Display node". Change all relevant strings

## Nice to haves:
- enable the option for a node to show only messages of selected channels. move the node "edit name" to a proper edit screen screen and also add the channel select feature there.
- Add Unit tests