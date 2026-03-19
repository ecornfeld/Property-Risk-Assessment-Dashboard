const fs = require('fs');

const streets = [
  'Main St','Oak Ave','Maple Dr','Cedar Ln','Pine St','Elm St','Washington Blvd',
  'Park Ave','Lake Dr','River Rd','Hill Rd','Valley Way','Forest Dr','Sunset Blvd',
  'Highland Ave','Meadow Ln','Canyon Rd','Lakeview Dr','Hillside Ter','Oakwood Ave',
  'Willow Way','Birch St','Spruce Ave','Aspen Ct','Magnolia Dr','Cypress Ln',
  'Sycamore Rd','Walnut St','Chestnut Ave','Poplar Dr','Palm Ave','Bayou Rd',
  'Bayview Dr','Oceanfront Dr','Shoreline Rd','Beachway Blvd','Marina Dr','Harbor Ln'
];

const cities = [
  // Florida (high flood risk)
  ['Miami','FL','33139'],['Miami Beach','FL','33140'],['Fort Lauderdale','FL','33301'],
  ['Hollywood','FL','33020'],['Hialeah','FL','33010'],['Naples','FL','34102'],
  ['Tampa','FL','33602'],['St Petersburg','FL','33701'],['Clearwater','FL','33755'],
  ['Orlando','FL','32801'],['Jacksonville','FL','32202'],['Pensacola','FL','32501'],
  ['Key West','FL','33040'],['Sarasota','FL','34230'],['Gainesville','FL','32601'],
  // Texas (flood + hurricane)
  ['Houston','TX','77001'],['Galveston','TX','77550'],['Corpus Christi','TX','78401'],
  ['Beaumont','TX','77701'],['Port Arthur','TX','77640'],['Freeport','TX','77541'],
  ['Rockport','TX','78382'],['Austin','TX','78701'],['Dallas','TX','75201'],
  ['San Antonio','TX','78201'],['El Paso','TX','79901'],['Lubbock','TX','79401'],
  // California (wildfire + coastal flood)
  ['Los Angeles','CA','90001'],['San Francisco','CA','94102'],['San Diego','CA','92101'],
  ['Sacramento','CA','95814'],['Malibu','CA','90265'],['Santa Rosa','CA','95401'],
  ['Paradise','CA','95969'],['Chico','CA','95926'],['Redding','CA','96001'],
  ['Bakersfield','CA','93301'],['Fresno','CA','93721'],['Oakland','CA','94601'],
  ['San Jose','CA','95101'],['Irvine','CA','92602'],['Riverside','CA','92501'],
  ['Palm Springs','CA','92262'],['Santa Barbara','CA','93101'],['Ventura','CA','93001'],
  // Louisiana (high flood)
  ['New Orleans','LA','70112'],['Baton Rouge','LA','70801'],['Shreveport','LA','71101'],
  ['Lafayette','LA','70501'],['Lake Charles','LA','70601'],
  // North Carolina (hurricane/flood)
  ['Wilmington','NC','28401'],['New Bern','NC','28560'],['Morehead City','NC','28557'],
  ['Charlotte','NC','28201'],['Raleigh','NC','27601'],
  // South Carolina
  ['Charleston','SC','29401'],['Myrtle Beach','SC','29577'],['Hilton Head Island','SC','29928'],
  ['Columbia','SC','29201'],
  // New York
  ['New York','NY','10001'],['Brooklyn','NY','11201'],['Queens','NY','11354'],
  ['Staten Island','NY','10301'],['Bronx','NY','10451'],['Buffalo','NY','14201'],
  // Colorado (wildfire)
  ['Denver','CO','80201'],['Boulder','CO','80301'],['Fort Collins','CO','80521'],
  ['Colorado Springs','CO','80901'],['Grand Junction','CO','81501'],
  // Oregon (wildfire)
  ['Portland','OR','97201'],['Eugene','OR','97401'],['Medford','OR','97501'],
  ['Grants Pass','OR','97526'],['Ashland','OR','97520'],['Salem','OR','97301'],
  // Washington (wildfire)
  ['Seattle','WA','98101'],['Spokane','WA','99201'],['Tacoma','WA','98401'],
  ['Yakima','WA','98901'],['Wenatchee','WA','98801'],
  // Arizona
  ['Phoenix','AZ','85001'],['Tucson','AZ','85701'],['Scottsdale','AZ','85251'],
  ['Tempe','AZ','85281'],['Mesa','AZ','85201'],['Flagstaff','AZ','86001'],
  // Nevada
  ['Las Vegas','NV','89101'],['Reno','NV','89501'],['Henderson','NV','89002'],
  ['Carson City','NV','89701'],
  // Georgia
  ['Atlanta','GA','30301'],['Savannah','GA','31401'],['Augusta','GA','30901'],
  ['Macon','GA','31201'],['Brunswick','GA','31520'],
  // Virginia/Maryland
  ['Norfolk','VA','23501'],['Virginia Beach','VA','23451'],['Richmond','VA','23219'],
  ['Baltimore','MD','21201'],['Annapolis','MD','21401'],
  // New Jersey
  ['Atlantic City','NJ','08401'],['Hoboken','NJ','07030'],['Newark','NJ','07101'],
  ['Jersey City','NJ','07302'],['Cape May','NJ','08204'],
  // Massachusetts
  ['Boston','MA','02101'],['Gloucester','MA','01930'],['Provincetown','MA','02657'],
  ['New Bedford','MA','02740'],['Worcester','MA','01601'],
  // Illinois/Midwest
  ['Chicago','IL','60601'],['Peoria','IL','61602'],['Springfield','IL','62701'],
  ['St Louis','MO','63101'],['Kansas City','MO','64101'],
  // Minnesota
  ['Minneapolis','MN','55401'],['St Paul','MN','55101'],['Duluth','MN','55801'],
  // Michigan
  ['Detroit','MI','48201'],['Grand Rapids','MI','49501'],['Ann Arbor','MI','48104'],
  // Ohio
  ['Columbus','OH','43201'],['Cleveland','OH','44101'],['Cincinnati','OH','45201'],
  // Pennsylvania
  ['Philadelphia','PA','19101'],['Pittsburgh','PA','15201'],['Allentown','PA','18101'],
  // Tennessee
  ['Nashville','TN','37201'],['Memphis','TN','38101'],['Knoxville','TN','37901'],
  ['Chattanooga','TN','37401'],
  // Alabama
  ['Mobile','AL','36601'],['Birmingham','AL','35201'],['Montgomery','AL','36101'],
  // Mississippi
  ['Biloxi','MS','39530'],['Gulfport','MS','39501'],['Jackson','MS','39201'],
  // Arkansas/Oklahoma
  ['Little Rock','AR','72201'],['Oklahoma City','OK','73101'],['Tulsa','OK','74101'],
  // Utah/Idaho/Montana
  ['Salt Lake City','UT','84101'],['Provo','UT','84601'],['Boise','ID','83701'],
  ['Billings','MT','59101'],['Missoula','MT','59801'],
  // New Mexico/Wyoming
  ['Albuquerque','NM','87101'],['Santa Fe','NM','87501'],['Cheyenne','WY','82001'],
  // Hawaii
  ['Honolulu','HI','96813'],['Hilo','HI','96720'],['Kailua','HI','96734'],
  // Pacific Northwest / Alaska
  ['Anchorage','AK','99501'],['Juneau','AK','99801'],
  // New England
  ['Portland','ME','04101'],['Burlington','VT','05401'],['Concord','NH','03301'],
  ['New Haven','CT','06510'],['Providence','RI','02901'],['Newport','RI','02840'],
  // Mid-Atlantic
  ['Wilmington','DE','19801'],['Dover','DE','19901'],
  // Midwest continued
  ['Indianapolis','IN','46201'],['Milwaukee','WI','53201'],['Madison','WI','53701'],
  ['Des Moines','IA','50301'],['Omaha','NE','68101'],['Wichita','KS','67201'],
  ['Fargo','ND','58102'],['Sioux Falls','SD','57101'],
  // Southeast
  ['Charleston','WV','25301'],['Louisville','KY','40201'],['Lexington','KY','40501'],
  ['Shreveport','LA','71101'],['Jackson','MS','39201'],['Tallahassee','FL','32301'],
];

const lines = ['address'];
for (let i = 0; i < 500; i++) {
  const num = (i * 137 % 8900) + 100; // deterministic but varied
  const street = streets[i % streets.length];
  const city = cities[i % cities.length];
  lines.push(`${num} ${street}, ${city[0]}, ${city[1]} ${city[2]}, USA`);
}

fs.writeFileSync(
  'C:/Users/ellio/OneDrive/Documents/risk-enrichment-dashboard/test-500-addresses.csv',
  lines.join('\n')
);
console.log('Written', lines.length - 1, 'addresses');
