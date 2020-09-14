If AWS is not set up, saves will be stored locally in this folder.

Save files will be named based on:
- The `label` specified when creating the game through `POST /games`
- The name of the game file, without extension
- The value of the `file` parameter when saving through `POST /games/:pid/save`
Separated with dashes and with a `.sav` extension.

See https://github.com/opendns/zmachine-api#post-gamespidsave for more info on saving.
