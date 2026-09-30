/* node tests/spelling.test.js — the knowledge-vs-spelling rules on real cases */
'use strict';
global.window = global;
require('../data/curriculum.js'); require('../js/spelling.js');
var C = ET.curriculum, S = ET.spelling;
var capDomain = C.countries.filter(function (c) { return c.capital; }).map(function (c) { return { id: c.id, label: c.capital, forms: [c.capital].concat(c.capAlt) }; });
var nameDomain = C.countries.map(function (c) { return { id: c.id, label: c.name, forms: [c.name].concat(c.alt) }; });
function cap(id) { return C.countries.filter(function (c) { return c.id === id; })[0]; }
var fails = 0, n = 0;
function t(typed, id, kind, want) {
  var c = cap(id), r = kind === 'cap'
    ? S.classify(typed, c.capital, { alts: c.capAlt, domain: capDomain })
    : S.classify(typed, c.name, { alts: c.alt, domain: nameDomain });
  n++;
  if (r.verdict !== want) { fails++; console.log('FAIL', JSON.stringify(typed), '→', kind, id, 'got', r.verdict, 'want', want, JSON.stringify(r)); }
}
// From the brief
t('Sagreb', 'kroatien', 'cap', 'known');
t('Lubliana', 'slowenien', 'cap', 'known');
t('Zagreb', 'kroatien', 'cap', 'right');
t('zagreb', 'kroatien', 'cap', 'right');
t('Wien', 'tschechien', 'cap', 'wrong');            // knows another capital, not this one
t('Bukarest', 'ungarn', 'cap', 'wrong');            // real other capital
t('Bukapest', 'ungarn', 'cap', 'wrong');            // equally close to Budapest and Bukarest: not sure
t('Budapst', 'ungarn', 'cap', 'known');
t('Bratislawa', 'slowakei', 'cap', 'known');
t('Bratislava', 'slowakei', 'cap', 'right');
t('Wilnius', 'litauen', 'cap', 'known');
t('Vilnjus', 'litauen', 'cap', 'known');
t('Kischinau', 'moldau', 'cap', 'right');           // accepted alternative
t('Chisinau', 'moldau', 'cap', 'right');
t('Kyjiw', 'ukraine', 'cap', 'right');
t('Kiev', 'ukraine', 'cap', 'known');
t('Warschaw', 'polen', 'cap', 'known');
t('Warsaw', 'polen', 'cap', 'known');
t('Rom', 'italien', 'cap', 'right');
t('Rum', 'italien', 'cap', 'known');
t('Riga', 'lettland', 'cap', 'right');
t('Riga', 'litauen', 'cap', 'wrong');
t('Paris', 'belgien', 'cap', 'wrong');
t('Lissabon', 'portugal', 'cap', 'right');
t('Lisabon', 'portugal', 'cap', 'known');
t('Kopenhagn', 'daenemark', 'cap', 'known');
t('Stokholm', 'schweden', 'cap', 'known');
t('Helsinki', 'finnland', 'cap', 'right');
t('Sarajewo', 'bosnien', 'cap', 'known');
t('Podgoritza', 'montenegro', 'cap', 'known');
t('Skopie', 'mazedonien', 'cap', 'known');
t('Tallin', 'estland', 'cap', 'known');
t('Madrid', 'spanien', 'cap', 'right');
t('Berlin', 'spanien', 'cap', 'wrong');
t('Brusel', 'belgien', 'cap', 'known');
t('Brüßel', 'belgien', 'cap', 'known');
t('Bern', 'schweiz', 'cap', 'right');
t('Bärn', 'schweiz', 'cap', 'known');
t('Wein', 'oesterreich', 'cap', 'known');           // swapped letters
t('Oslo', 'norwegen', 'cap', 'right');
t('Sofia', 'bulgarien', 'cap', 'right');
t('Belgrat', 'serbien', 'cap', 'known');
t('Minsk', 'weissrussland', 'cap', 'right');
t('Moskow', 'russland', 'cap', 'known');
t('Xyz', 'polen', 'cap', 'wrong');
t('', 'polen', 'cap', 'wrong');
// country names
t('Slowenien', 'slowenien', 'name', 'right');
t('Slovenien', 'slowenien', 'name', 'known');
t('Slowakei', 'slowenien', 'name', 'wrong');        // another country
t('Slowenen', 'slowenien', 'name', 'known');
t('Tschechien', 'tschechien', 'name', 'right');
t('Tschechiesche Republik', 'tschechien', 'name', 'known');
t('Tchechien', 'tschechien', 'name', 'known');
t('Belarus', 'weissrussland', 'name', 'right');
t('Weissrussland', 'weissrussland', 'name', 'known');
t('Osterreich', 'oesterreich', 'name', 'known');
t('Östereich', 'oesterreich', 'name', 'known');
t('Nordmazedonien', 'mazedonien', 'name', 'right');
t('Masedonien', 'mazedonien', 'name', 'known');
t('Grosbritanien', 'grossbritannien', 'name', 'known');
t('Litauen', 'lettland', 'name', 'wrong');
t('Letland', 'lettland', 'name', 'known');
t('Rumänien', 'bulgarien', 'name', 'wrong');
t('Rumenien', 'rumaenien', 'name', 'known');
t('Irland', 'island', 'name', 'wrong');
t('Island', 'island', 'name', 'right');
t('Schwiz', 'schweiz', 'name', 'known');
t('Schweden', 'schweiz', 'name', 'wrong');
t('Bosnien Herzegowina', 'bosnien', 'name', 'known');
t('Bosnien-Herzegowina', 'bosnien', 'name', 'right');
// helpers
var h1 = S.hint('Ljubljana', 'Ljub-lja-na', 1), h2 = S.hint('Ljubljana', 'Ljub-lja-na', 2);
n++; if (h1 !== 'L _ u _ l _ a _ a') { fails++; console.log('FAIL hint1', h1); }
n++; if (h2 !== 'Ljub – lja – na') { fails++; console.log('FAIL hint2', h2); }
var d = S.diff('Zagreb', 'Sagreb');
n++; if (!(d[0].bad && !d[1].bad)) { fails++; console.log('FAIL diff', JSON.stringify(d)); }
n++; if (S.koelner('Sagreb') !== S.koelner('Zagreb')) { fails++; console.log('FAIL koelner'); }
console.log(n - fails + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
