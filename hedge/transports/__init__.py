"""Transports: ways in. Each one connects players to the hub with a sink.

telnet   lines over TCP, with GMCP for clients that ask for it
stdin    one player, lines in, text out (solo play, transcripts, test vectors)
ws       WebSocket: JSON events out, lines or verbs in; serves web/index.html too
api      Python calls, for tests and for other programs
"""
