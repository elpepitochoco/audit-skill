import base64
import os
import pickle
import sqlite3

from flask import Flask, request

app = Flask(__name__)
DB_PATH = os.environ.get("DB_PATH", "notes.db")


def connect():
    return sqlite3.connect(DB_PATH)


def count_words(text):
    return len(text.split())


@app.route("/notes")
def search_notes():
    q = request.args.get("q", "")
    rows = connect().execute(f"SELECT id, title FROM notes WHERE title LIKE '%{q}%'").fetchall()
    return {"notes": [{"id": r[0], "title": r[1]} for r in rows]}


@app.route("/prefs")
def read_prefs():
    raw = request.cookies.get("prefs")
    prefs = pickle.loads(base64.b64decode(raw)) if raw else {}
    return {"theme": prefs.get("theme", "light")}


@app.route("/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    conn = connect()
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    return "", 204


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
