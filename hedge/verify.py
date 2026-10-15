"""Verify a spell with chibi-scheme, when it is installed.

check.scm is the grammar written in Scheme. If chibi-scheme is on the PATH
(or named by HEDGE_CHIBI), a spell goes through it before it runs. If not,
the Python reader in spell.py makes the same checks, and says so.
"""

import os
import shutil
import subprocess

from . import spell

CHECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check.scm")


def chibi_path():
    return os.environ.get("HEDGE_CHIBI") or shutil.which("chibi-scheme")


def verify(text, timeout=5):
    """Returns (ok, message, backend). backend is "chibi" or "python"."""
    exe = chibi_path()
    if exe:
        try:
            r = subprocess.run([exe, CHECK], input=text, capture_output=True, text=True, timeout=timeout)
            out = (r.stdout + r.stderr).strip()
            if r.returncode == 0 and out.endswith("ok"):
                return True, "ok", "chibi"
            msg = out.splitlines()[-1] if out else "chibi-scheme gave no answer"
            if msg.startswith("error: "):
                msg = msg[len("error: "):]
            return False, msg, "chibi"
        except (OSError, subprocess.TimeoutExpired) as e:
            return False, f"chibi-scheme failed: {e}", "chibi"
    try:
        spell.parse(text)
        return True, "ok", "python"
    except spell.SpellError as e:
        return False, str(e), "python"
