-- The labs and workstations that exist in the building. Reference data, not test data.

INSERT INTO labs (id, code, name, building) VALUES
  (1, '1250', 'Lab 1250 - Web and Cloud',  'Block 1'),
  (2, '2310', 'Lab 2310 - Networks',       'Block 2');

INSERT INTO workstations (id, lab_id, label, seats, active) VALUES
  (1, 1, 'WS-01', 2, 1),
  (2, 1, 'WS-02', 2, 1),
  (3, 1, 'WS-03', 4, 1),
  (4, 2, 'NET-01', 2, 1),
  (5, 2, 'NET-02', 2, 0);
