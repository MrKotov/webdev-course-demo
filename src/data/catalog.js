// Data access for the physical things: labs and the workstations in them.

export const allLabs = (db) => db.all('SELECT id, code, name, building FROM labs ORDER BY code');

export const workstationsOfLab = (db, labId) =>
  db.all('SELECT id, lab_id, label, seats, active FROM workstations WHERE lab_id = ? ORDER BY label', labId);

export const findWorkstation = (db, id) =>
  db.get('SELECT id, lab_id, label, seats, active FROM workstations WHERE id = ?', id);
