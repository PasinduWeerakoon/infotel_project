/** Test visitors of the QuickLook mock. `sub` is the pairwise ID our apps receive. */
export const USERS = [
  { sub: 'ql_pw_nimal01', givenName: 'Nimal' },
  { sub: 'ql_pw_kasun02', givenName: 'Kasun' },
  { sub: 'ql_pw_ayesha03', givenName: 'Ayesha' },
  { sub: 'ql_pw_dilini04', givenName: 'Dilini' },
  { sub: 'ql_pw_ruwan05', givenName: 'Ruwan' },
  { sub: 'ql_pw_sanduni06', givenName: 'Sanduni' },
  { sub: 'ql_pw_tharindu07', givenName: 'Tharindu' },
  { sub: 'ql_pw_ishara08', givenName: 'Ishara' },
  ...[
    'Chamara',
    'Nadeesha',
    'Pradeep',
    'Shanika',
    'Lahiru',
    'Malsha',
    'Gayan',
    'Hiruni',
    'Sahan',
    'Tharushi',
  ].map((givenName, i) => ({
    sub: `ql_pw_${givenName.toLowerCase()}${String(i + 9).padStart(2, '0')}`,
    givenName,
  })),
];
