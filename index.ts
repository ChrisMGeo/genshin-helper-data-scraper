import { google } from "googleapis";
import {
  allCharacterKeys,
  allWeaponTypeKeys,
  CharacterKey,
  ElementKey,
  WeaponTypeKey,
} from "./consts";
import Fuse from "fuse.js";
import fs from "fs";

function complete(commands: readonly string[]) {
  return function (str: string) {
    var i;
    var ret = [];
    for (i = 0; i < commands.length; i++) {
      if (commands[i].indexOf(str) == 0) ret.push(commands[i]);
    }
    return ret;
  };
}
const weaponTypePrompt = require("prompt-sync")({
  autocomplete: complete(allWeaponTypeKeys),
});
const characterKeyPrompt = require("prompt-sync")({
  autocomplete: complete(allCharacterKeys),
});

function askCharacterKey(
  message: string = "Insert CharacterKey: "
): CharacterKey {
  return askKey<CharacterKey>(allCharacterKeys, message, characterKeyPrompt);
}

function askWeaponType(
  message: string = "Insert WeaponTypeKey: "
): WeaponTypeKey {
  return askKey<WeaponTypeKey>(allWeaponTypeKeys, message, weaponTypePrompt);
}

function askKey<T extends string>(
  allOfT: readonly string[],
  message: string,
  pr: Function
): T {
  const result: string = pr(message);
  if (allOfT.includes((result as any) ?? "")) {
    return result as T;
  } else {
    return askKey<T>(allOfT, message, pr);
  }
}

async function getData() {
  const options = {
    includeScore: true,
    threshold: 0.3,
  };
  const characterFuse = new Fuse(allCharacterKeys, options);

  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets.readonly",
  });
  const client = await auth.getClient();
  const googleSheets = google.sheets({ version: "v4", auth: client });
  const spreadsheetId = "1gNxZ2xab1J6o1TuNVWMeLOZ7TPOqrsf3SshP5DLvKzI";
  // const spreadsheetId = "1H0nNrkxYbX9l5UO-42c0mr6_-gckGpgvQrKbshbQgAU";
  let sheetNames = ["Pyro ", "Electro ", "Hydro ", "Cryo ", "Anemo ", "Geo "]; //TODO: Add Dendro
  let jsonData: any = {};
  jsonData.characters = [];
  const bRowRanges: string[] = sheetNames.map(
    (sheetName) => `${sheetName}!B:B`
  );
  console.log(bRowRanges);
  const bRows = await googleSheets.spreadsheets.values.batchGet({
    auth,
    spreadsheetId,
    ranges: bRowRanges,
  });
  const valueRanges = bRows.data.valueRanges;
  let characterRanges: string[] = [];
  if (valueRanges !== undefined) {
    for (let i = 0; i < valueRanges.length; i++) {
      const bRow = valueRanges[i].values;
      let last_j = 0;
      if (bRow !== undefined && bRow !== null) {
        for (let j = 0; j < bRow.length; j++) {
          const cell: string = bRow[j][0];
          if (cell !== undefined && cell !== null) {
            if (!cell.toLowerCase().includes("notes")) {
              last_j = j;
            } else {
              const characterRange: string = `${sheetNames[i]}!B${j + 1}:I${
                last_j + 1
              }`;
              characterRanges.push(characterRange);
            }
          }
        }
      }
    }
  }
  const characterData = await googleSheets.spreadsheets.values.batchGet({
    auth,
    spreadsheetId,
    ranges: characterRanges,
  });
  console.log(characterRanges.length);
  const characterValueRanges = characterData.data.valueRanges;
  if (characterValueRanges !== undefined && characterValueRanges !== null) {
    for (let i = 0; i < characterValueRanges.length; i++) {
      const characterValues = characterValueRanges[i];
      const element: ElementKey = characterValues.range
        ?.split(" '")[0]
        .slice(1)
        .toLowerCase() as ElementKey;
      const viewName: string = (
        characterValues.values !== undefined && characterValues.values !== null
          ? characterValues.values
          : [["Amber"]]
      )[0][0].replaceAll("\n", " ");
      const result = characterFuse.search(viewName.replaceAll(" ", ""));
      let name: CharacterKey | "" = result.length !== 0 ? result[0].item : "";
      if (name === "") {
        name = askCharacterKey(`Insert CharacterKey for ${viewName}: `);
      }
      let builds: any[] = [];
      const weapon = askWeaponType(`Insert WeaponTypeKey for ${viewName}: `);
      const notes: string =
        characterValues.values !== undefined &&
        characterValues.values !== undefined
          ? characterValues.values?.slice(-1)[0][1]
          : "";
      if (
        characterValues.values !== undefined &&
        characterValues.values !== null
      ) {
        for (
          let build = 2;
          build < characterValues.values.length - 1;
          build++
        ) {
          const buildValues = characterValues.values[build].slice(1);
          const buildName: string =
            buildValues[0] !== undefined ? buildValues[0] : "";
          const buildWeapons: string =
            buildValues[1] !== undefined ? buildValues[1] : "";
          const buildArtifacts: string =
            buildValues[2] !== undefined ? buildValues[2] : "";
          const buildArtifactMainStats: string =
            buildValues[3] !== undefined ? buildValues[3] : "";
          const buildArtifactSubstats: string =
            buildValues[4] !== undefined ? buildValues[4] : "";
          const buildTalentPriority: string =
            buildValues[5] !== undefined ? buildValues[5] : "";
          const buildAbilityTips: string =
            buildValues[6] !== undefined ? buildValues[6] : "";
          const buildObject = {
            name: buildName,
            weapons: buildWeapons,
            artifact_sets: buildArtifacts,
            artifact_main: buildArtifactMainStats,
            artifact_sub: buildArtifactSubstats,
            talent_priority: buildTalentPriority,
            ability_tips: buildAbilityTips,
            notes: "",
          };
          console.log(buildObject);
          builds.push(buildObject);
        }
      }
      console.log(
        `viewName: ${viewName} name: ${name} element: ${element} weapon: ${weapon}\n\tnotes: ${notes}\n`
      );
      const character = {
        viewName: viewName,
        name: name,
        element: element,
        weapon: weapon,
        notes: notes,
        builds: builds,
      };
      jsonData.characters.push(character);
    }
  }
  fs.writeFile("data.json", JSON.stringify(jsonData), (error) => {
    if (error) throw error;
  });
}

getData();
