zmachine-api
============
Score: 0		Moves: 0

You are standing in a repository. There is a README here.

Overview
--------

This project aims to provide a simple web service that can bring up and run
games in a z-machine. It was originally written to be interacted with by a
[hubotscript](https://github.com/opendns/hubot-zmachine), but could presumably
be used by anything you like, which is the fun of APIs.

The API uses the [dfrotz z-machine interpreter](https://github.com/DavidGriffith/frotz).
Each game you start is run in a different dfrotz process, and APIs for managing
these processes are included.

This was thrown together by a few developers, and could almost certainly be
better than it is. Please feel free to contribute improvements!

Dependencies
------------

- `nodejs`
- `npm`
- `wget`
- `dfrotz` (the makefile will download this from [its GitLab repository](https://gitlab.com/DavidGriffith/frotz/-/releases) and install it for you)

Building
--------

Really just the dependencies need to be built. It should just be a matter of:

```bash
make all
```

Frotz 2.44 will be downloaded and built, and a symlink created so zmachine-api
can find it. All node dependencies will be installed as well.

Configuration
-------------

You should copy the existing `.env.example` to `.env` and customize it to set the
`PORT` (e.g. `3000`) and `LOG_LEVEL` (e.g. `warn` or `debug`) options.

We support writing save files to Amazon S3. This is configured in the
`.env` file with your own AWS credentials to use S3 saves. If S3 is not
 configured, games will be saved to disk only.

Bringing up a server
--------------------

```bash
npm start
```

What about the games?
---------------------

Create a `zcode` directory to store your games. We currently only suport `.z3`–`.z8`
format games.

We don't provide you with any games, but feel free to drop any zcode files you
come across in the zcode directory. There are lots of good public domain games
out there, why not try a bunch?

There is a great selection of zcodes games here as well as many other places.
[if-archive/games/zcode](https://ifarchive.org/indexes/if-archiveXgamesXzcode.html)


There is a Dockerfile here
--------------------------

You can also skip most of this and use the provided Dockerfile, if it suits you.
It'll take care of the dependencies and build process and give you just a
container listening for HTTP requests.

If you're using Docker, and you don't have S3 configured, take steps to ensure
that `/root/saves` is preserved (use a Volume, mount a network drive, etc) or your
saved games will be lost when the container is redeployed.

The API
-------

Here's how the API works.

#### `GET /titles`

Returns a list of all installed z-code games. These are what you can use with
`POST /games`

Response:

```json
[
  {
      "zFile": "ZORK1.z5"
  },
  {
      "zFile": "ZORK2.z5"
  }
]
```

#### `GET /games`

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

#### `POST /games`

Spawns a new zmachine with a specific game.

Request body:

```json
{
  "game": "foo",
  "label": "foo game"
}
```

- **`game`** is the zmachine file (without the file extension) you wish to play
- **`label`** is an arbitrary label, used as part of the filename when you save

Response:

```json
{
  "pid": 12345,
  "data": "Startup text from the game"
}
```

- **`pid`** is the process ID of the z-machine that was spawned by the creation of the game
- **`data`** is the text that the game returned when it started.

#### `DELETE /games/:pid`

Where `:pid` is the value of `pid` returned by `POST /games`

Stops a running zmachine process and deletes from the list of active games

Response:

```
Game for :pid terminated.
```

#### `POST /games/:pid/action`

Where `:pid` is the value of `pid` returned by `POST /games`

Send a game action to a running zmachine

Request body:

```json
{
  "action": "go west",
}
```

- **`action`** is the command that the player typed to the game

Response:

```json
{
  "pid": 12345,
  "data": "You go west. It's okay."
}
```

- **`pid`** the zmachine process id
- **`data`** the game's response

#### `POST /games/:pid/save`

Where `:pid` is the value of `pid` returned by `POST /games`

Saves the game's current state to a file and uploads to S3. The filename that is
written to S3 is `saves/:label-:game-:file.sav` where `:label` is the label you
used when spawning the zmachine instance, `:game` is the game file that is running
(without the file extension), and `:file` is the filename specified in the
request body of this API call. If S3 is not set up, the game will be saved locally
under the same path.

Request body:

```json
{
  "file": "somefile",
}
```

- **`file`** is a saved game name that you can use later to restore the game.

Response:

```json
{
  "pid": 12345,
  "data": "Whatever the game says in response to the save action"
}
```

- **`pid`** is the process id of the zmachine instance that you sent it to. Will be
 the same as the pid in the URL you posted to.
- **`data`** is the response the game returned when it was saved.

#### `POST /games/:pid/restore`

Where `:pid` is the value of `pid` returned by `POST /games`

Restore a saved file into a zmachine process.

Request body:

```json
{
  "file": "somefile",
}
```

- **`file`** is a game name that you previously saved. The `game` and `label` for
the pid (created when you spawned a new zmachine) are combined with this to find
the file to restore.

Response:

```json
{
  "pid": 12345,
  "data": "Whatever the game says in response to the load action"
}
```

- **`pid`** is the process id of the zmachine instance that you sent it to. Will be
 the same as the pid in the URL you posted to.
- **`data`** is the response the game returned when it was restored.

Tutorial
--------

This tutorial will walk through the steps to create a long-running game, one
where you don't want the zmachine process to stay up and running. In this tutorial
the game will be saved and restored between every single command.

dfrotz is extremely lightweight (Zork was originally run on a TRS-80, after all),
and keeping the processes around generally won't hurt anything. But if your machine
is very ephemeral (yay, cloud!), you might not be able to rely on the processes
being alive if a player comes back to the game after months. Or you might just be
a neat freak who can't stand to have all those processes lying around. Regardless,
this tutorial will be helpful in understanding how the API interacts with the
dfrotz process and how saved games work.

A session ID provided by your application is used to keep track of the game for
each player. The session ID can be anything you like, it just needs to be something
you can keep track of for the entire length of the game.

1. `POST /games` with a zmachine game name and your session ID.

  ```json
  {
    "game": "zork",
    "label": "player1234"
  }
  ```

  zmachine-api will respond with the OS process id of the instance it spawned,
  and the startup text from the game.

  ```json
  {
    "pid": 12345,
    "data": "welcome to the game"
  }
  ```

  Return the `data` to the player.

2. Send a game command to the PID of the game

  ```json
  POST /games/12345/action

  {
    "action": "go west",
  }
  ```

  zmachine-api responds with

  ```json
  {
    "pid": 12345,
    "data": "You go west. It's okay."
  }
  ```

  Return the `data` to the player.

3. Pick a file name you wish to save this game under. We're going to use the same
name for every saved game. Saved games automatically have the session ID appended
to them, so we don't need to use something unique for the name.

  Send `POST /games/12345/save` using the saved game name you selected:

  ```json
  {
    "file": "save"
  }
  ```

  The response will contain a data element with whatever the game responds with
  when you save. Normally, a player would see this, but since they didn't ask for
  the save, telling them you just saved after every game action would be pretty
  confusing.

4. Quit the zmachine process with a `DELETE /games/12345`

5. When you get a new command, it's time to restore the game. `POST /games`
  using the same session ID `label` and `game` as you used in the first step:

  ```json
  {
    "game": "zork",
    "label": "player1234"
  }
  ```

  zmachine-api responds with a new process ID, and the initial game text.

  ```json
  {
    "pid": 67890,
    "data": "Startup text from the game"
  }
  ```

  Because we're restoring the game automatically based on the label you provided,
  **don't** send the `data` element back to the player.  They don't know we're
  saving and restoring repeatedly, game save and restore messages would be
  confusing to them.

6. Using `POST /games/67890/restore` restore the game in the background to the
  new zmachine process, using the same file name as was used to save it.

  ```json
  {
    "file": "somefile",
  }
  ```

7. Start over at step 2, but now with the `pid` you received in step 5.

Bugs?
-----

Yes, probably.

By all means, open an issue on GitHub. Or, better yet, submit a pull request!
