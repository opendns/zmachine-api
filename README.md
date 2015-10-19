zmachine-api
==================
Score: 0		Moves: 0

You are standing in a repository. There is a README here.


Overview
--------
This project aims to provide a simple web service that can bring up and run
games in a z-machine. It was originally written to be interacted with by a [hubot
script](https://github.com/opendns/hubot-zmachine), but could presumably be used by anything you like, which is the fun of
APIs.

This was thrown together by a few developers, and could almost certainly be
better than it is. Please feel free to contribute improvements!

Dependencies
------------
- nodejs
- npm
- wget

Building
--------
Really just the dependencies need to be built. It should just be a matter of:
```
make all
```

Configuration
-------------
Right now we support writing save files to Amazon S3. This is configured by a
.env file. You can copy the existing .env.example and customize it with your own
AWS credentials to use S3 saves.

Bringing up a server
--------------------
```bash
node src/server.js
```

There is a Dockerfile here
--------------------------
You can also skip most of this and use the provided Dockerfile, if it suits you.
It'll take care of the dependencies and build process and give you just a
container listening for HTTP requests.

The API
-------
This is some rough documentation of the API itself. Improving it is on the to-do list.

#### GET /games
Returns a list of all active games.

Response:
```json
[
    {
        "pid": 12345,
        "name": "foo",
        "zFile": "foo.z5",
        "label": "foo game"
    }
]
```

#### POST /games
Create a new game.

Request body:
```json
{
    "game": "foo",
    "label": "foo game"
}
```

Response:
```json
{
    "pid": 12345,
    "data": "Startup text from the game"
}
```

#### DELETE /games/:pid
Delete a running game

#### POST /games/:pid/action
Send an action to a running game

Request body:
```json
{
    "action": "go west",
}
```

Response:
```json
{
    "pid": 12345,
    "data": "You go west. It's okay."
}
```

#### POST /games/:pid/save
Send an action to a running game

Request body:
```json
{
    "file": "somefile",
}
```

Response:
```json
{
    "pid": 12345,
    "data": "Whatever the game says in response to the save action"
}
```

#### POST /games/:pid/restore
Send an action to a running game

Request body:
```json
{
    "file": "somefile",
}
```

Response:
```json
{
    "pid": 12345,
    "data": "Whatever the game says in response to the load action"
}
```

Bugs?
-----
Yes, probably.

By all means, open an issue on GitHub. Or, better yet, submit a pull request!

What about the games?
---------------------
We don't provide you with any games, but feel free to drop any zcode files you
come across in the zcode directory. There are lots of good public domain games
out there, why not try a bunch?
