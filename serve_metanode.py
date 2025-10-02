import uvicorn
import falcon.asgi
import asyncio
import os
import json
import time
from traceback import format_exc
from multiprocessing import Process
from metaNODE import main as start_metanode
from metaNODE import spool, PATH
import sys


TEXT_FILE_PATH = os.path.join(PATH, "metaNODE.txt")


# Function to read the text file
def read_text_file():
    if os.path.exists(TEXT_FILE_PATH):
        with open(TEXT_FILE_PATH, "r") as file:
            return json.loads(file.read())
    return "File not found."


class TextFileResource:
    async def on_websocket(self, req, ws):
        await ws.accept()

        while True:
            try:
                start = time.time()
                contents = read_text_file()
                read = time.time() - start
                contents["file_read"] = read
                await ws.send_media(contents)
                await asyncio.sleep(1)  # Update every second
            except falcon.WebSocketDisconnected:
                return
            except Exception as e:
                print(format_exc(e))
                await asyncio.sleep(2)


def main():
    # Create Falcon ASGI app
    app = falcon.asgi.App()
    text_file_resource = TextFileResource()
    app.add_route("/metaNODE", text_file_resource)

    storage, cache = spool()

    child = Process(target=start_metanode, args=(storage, cache))
    child.start()
    try:
        port = 8127
        if len(sys.argv) > 1:
            port = int(sys.argv[1])
        uvicorn.run(app, host="0.0.0.0", port=port)
    finally:
        child.terminate()

if __name__ == '__main__':
    main()
