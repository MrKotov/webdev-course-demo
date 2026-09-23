-- Demo accounts so the app is usable the moment it starts.
-- Passwords are scrypt hashes of 'parola123' / 'parola456' / 'parola789'.
-- A real deployment drops this migration and creates accounts through sign-up.

INSERT INTO users (id, email, full_name, password_hash) VALUES
  (1, 'ivan@tu-sofia.bg',  'Ivan Petrov',
   'scrypt$d5de5b64e21d309f1531c28f1fa4ff21$030a945484c0cd64d25de72fe3006ddc0b5ea4c37ee38c20066a591adaf0a501'),
  (2, 'maria@tu-sofia.bg', 'Maria Georgieva',
   'scrypt$c7f1a2da12e4508c3756dedcd89afdf4$ae7d63a423442b8fd181b5c84ac9ca7980c9b745aae54cff0d46059db52d110e'),
  (3, 'assistant@tu-sofia.bg', 'Course Assistant',
   'scrypt$4b71d3800a34c2f072345b638f8e877e$ba93f9c82c4390556843278dca5d5b6cb4fa9ff235cfad714b040f74df7f15a6');
