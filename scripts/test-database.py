"""Disposable local Postgres, private Unix socket, no network/database credentials."""
import pathlib, subprocess, tempfile, os, shutil, getpass, shlex
from urllib.parse import quote
root=pathlib.Path(__file__).resolve().parents[1]
def postgres_bin():
    if os.environ.get('PGBIN'):
        candidate = pathlib.Path(os.environ['PGBIN'])
    elif shutil.which('pg_config'):
        candidate = pathlib.Path(subprocess.check_output(['pg_config', '--bindir'], text=True).strip())
    elif shutil.which('initdb'):
        candidate = pathlib.Path(shutil.which('initdb')).parent
    else:
        raise SystemExit('Install PostgreSQL server tools (initdb, pg_ctl, psql), then set PGBIN to their bin directory.')
    if not all((candidate / name).is_file() for name in ('initdb', 'pg_ctl', 'psql')):
        raise SystemExit('PGBIN must contain initdb, pg_ctl and psql.')
    return candidate
pgbin=postgres_bin()
pg_env={name:value for name,value in os.environ.items() if not name.startswith('PG')}
with tempfile.TemporaryDirectory(prefix='radar-db-',dir='/tmp') as temp:
    work=pathlib.Path(temp); data=work/'data'; sock=work/'socket'; sock.mkdir()
    subprocess.run([str(pgbin/'initdb'),'-D',str(data),'-A','trust','--no-locale','-E','UTF8'],check=True,capture_output=True,env=pg_env)
    started=False
    try:
        subprocess.run([str(pgbin/'pg_ctl'),'-D',str(data),'-l',str(work/'postgres.log'),'-o',f"-k {sock} -p 55461 -h ''",'-w','start'],check=True,capture_output=True,env=pg_env)
        started=True
        args=[str(pgbin/'psql'),'-h',str(sock),'-p','55461','-d','postgres','-v','ON_ERROR_STOP=1','-X']
        subprocess.run(args,input='create role anon; create role authenticated; create role service_role bypassrls; create role radar_evaluator; create role radar_reader;',text=True,check=True,capture_output=True,env=pg_env)
        shimdir=work/'bin'; shimdir.mkdir(); shim=shimdir/'psql'
        shim.write_text(f'#!/bin/sh\nexport PGHOST={shlex.quote(str(sock))}\nexport PGSSLMODE=disable\nexec {shlex.quote(str(pgbin/"psql"))} "$@"\n'); shim.chmod(0o700)
        env={**pg_env,'PATH':str(shimdir)+':'+os.environ['PATH'],
            'RADAR_DB_TEST':'1',
            'RADAR_MIGRATION_DATABASE_PASSWORD':'',
            'RADAR_MIGRATION_DATABASE_URL':f'postgresql://{quote(getpass.getuser(), safe="")}@localhost:55461/postgres?sslmode=require'}
        for command in ('migrate','migrate','grant-roles'):
            r=subprocess.run(['node',str(root/'scripts/db.mjs'),command],env=env,text=True,capture_output=True)
            if r.returncode: raise RuntimeError(r.stdout+r.stderr)
            print('runner',command,'PASS')
        for filename in ('database.sql','runtime-roles.sql','collection.sql','search-profiles.sql'):
            r=subprocess.run(args+['-f',str(root/'tests'/filename)],text=True,capture_output=True,env=pg_env)
            if r.returncode: raise RuntimeError(r.stdout+r.stderr)
            print(filename, r.stderr.count('PASS:'),'checks PASS')
    finally:
        if started: subprocess.run([str(pgbin/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,capture_output=True,env=pg_env)
