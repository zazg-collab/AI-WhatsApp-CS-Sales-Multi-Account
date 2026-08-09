import { normalisasiProvinsi, terapkanAlias, PROVINSI_ALIAS } from '../apps/api/src/modules/shipping/shipping.service';

const keyword = "Kota Mataram";
const province = "Nusa Tenggara Barat";
const cfg = { destinationAliases: {} };
const dicariMentah = terapkanAlias(keyword, cfg.destinationAliases);
const dicari = [...new Set(dicariMentah.split(/\s+/))].join(' ');
console.log("dicariMentah:", dicariMentah);
console.log("dicari:", dicari);

const k = dicari.trim().toLowerCase().replace(/\s+/g, ' ');
console.log("k for resolveDestination:", k);

// Now let's simulate the API return values for "Kota Mataram" and "Mataram"
const c_province = "NUSA TENGGARA BARAT (NTB)";
const p = normalisasiProvinsi(c_province);
const prov = normalisasiProvinsi(province);
console.log("c_province norm:", p);
console.log("province norm:", prov);
console.log("p.includes(prov):", p.includes(prov));
console.log("prov.includes(p):", prov.includes(p));

