/* global db, quit, rs, sleep */

const config = {
  _id: 'rs0',
  members: [
    {
      _id: 0,
      host: 'mongo:27017',
    },
  ],
};

try {
  const status = rs.status();
  if (status?.ok === 1) {
    print('[site-builder-mongo] replica set already initialized');
    quit(0);
  }
} catch (error) {
  if (!String(error?.message || '').includes('no replset config has been received')) {
    print(`[site-builder-mongo] rs.status before init: ${error.message}`);
  }
}

try {
  const result = rs.initiate(config);
  print(`[site-builder-mongo] rs.initiate result: ${JSON.stringify(result)}`);
} catch (error) {
  if (error?.codeName === 'AlreadyInitialized' || String(error?.message || '').includes('already initialized')) {
    print('[site-builder-mongo] replica set already initialized');
    quit(0);
  }
  throw error;
}

for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const ping = db.adminCommand({ ping: 1 });
    if (ping?.ok === 1) {
      print('[site-builder-mongo] replica set is reachable');
      quit(0);
    }
  } catch (error) {
    print(`[site-builder-mongo] waiting for replica set: ${error.message}`);
  }
  sleep(1000);
}

throw new Error('Replica set did not become reachable in time');
