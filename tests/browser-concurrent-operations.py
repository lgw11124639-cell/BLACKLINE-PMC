"""Parallel missions were replaced by a single 24-person command operation."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('browser-national-workflow.py')), run_name='__main__')
