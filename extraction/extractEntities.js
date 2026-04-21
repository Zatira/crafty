//@ts-check
const fs = require('fs');
const path = require('path');

const inputDir = process.argv[2];
const translationFile = process.argv[3] || '';

const outputFile = process.argv[4] || 'entities.json';

if (!inputDir) {
    console.error('Usage: node extractEntities.js <input-directory> [translations-file][output-file]');
    process.exit(1);
}

async function ingestTranslation() {
    if (translationFile) {
        const data = await fs.promises.readFile(translationFile, 'utf8');
        return JSON.parse(data)
    }
    console.log("no translations provided, extraction with untranslated values")
    return null
}

// Recursively collect all .json files
async function getJsonFiles(dir) {
    let results = [];

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const subFiles = await getJsonFiles(fullPath);
            results.push(...subFiles);
        } else if (entry.isFile() && path.extname(entry.name) === '.json') {
            results.push(fullPath);
        }
    }

    return results;
}

async function combineJsonFiles() {
    const translations = await ingestTranslation()
    try {
        const jsonFiles = await getJsonFiles(inputDir)

        if (jsonFiles.length === 0) {
            console.log('No JSON files found.');
            return;
        }

        const combinedList = [];

        for (const file of jsonFiles) {
            const filePath = file;

            try {
                const jsonData = await fetchFile(filePath);

                const converted = await convertUAsset(jsonData, translations, filePath, jsonFiles)

                combinedList.push(converted);


            } catch (err) {
                console.error(`Skipping ${file}: ${err.message}`);
            }
        }

        // Write combined output
        await fs.promises.writeFile(
            outputFile,
            JSON.stringify(combinedList.filter(Boolean), null, 2),
            'utf8'
        );

        console.log(`Combined ${jsonFiles.length} files into ${outputFile}`);

    } catch (err) {
        console.error('Error:', err.message);
    }
}

async function fetchFile(filePath) {
    const data = await fs.promises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    return jsonData;
}

async function convertUAsset(jsonData, translations, filePath, jsonFiles) {
    if (!Array.isArray(jsonData)) {
        console.warn('skipped', filePath.split("/").pop())
        return
    }
    if (jsonData.filter(jd => jd.Type == "CrBuildingCraftingTrait").length > 0) {
        const excludes = [
            "MegaMachine",
            "Interior",
            "StartingPrinter",
            "ForgottenEngine",
            "Prototypes",
            "Antenna",
            "ResearchLab"
        ]
        if (excludes.find((ex) => filePath.indexOf(ex) > -1)) {
            //console.log('skip', filePath.split("/").pop())
            return
        }
        return await convertFactory(jsonData, translations, filePath, jsonFiles)
    } else {
        const recipe = jsonData.filter(jd => jd.Type == "CrItemRecipeData").pop()
        if (recipe) {
            return convertCrRecipe(jsonData, translations, filePath)
        }
        const item = jsonData.filter(jd => jd.Properties?.UIItemType == "EUIItemType::Resource").pop()
        if (item) {
            return convertCrItem(jsonData, translations)
        }
        //console.log('skip', filePath.split("/").pop())
        return
    }
}

async function convertFactory(jsonData, translations, filePath, jsonFiles) {
    const factory = {
        type: "factory"
    }
    const craftingTrait = jsonData.filter(jd => jd.Type == "CrBuildingCraftingTrait").pop()
    if (craftingTrait) {
        factory.internalId = shortenPath(craftingTrait.Outer.ObjectPath)
        let rc = shortenPath(craftingTrait.Properties.CraftingParameters.RecipeCollection.ObjectPath)
        if (factory.internalId == "DA_MechanicalDrillTier2") {
            rc = "CRC_MechanicalDrillTier2"
        }
        if (rc) {
            const rcFilePath = jsonFiles.find(path => path.endsWith(rc + ".json"))
            const rcData = await fetchFile(rcFilePath)
            const rcDataElement = rcData?.find(e => e.Type == "CrItemRecipeCollection")
            if (rcDataElement) {
                factory.recipes = rcDataElement.Properties?.Recipes?.map(r => shortenPath(r.ObjectPath))
            }
        }
    }
    const electricityTrait = jsonData.filter(jd => jd.Type == "CrElectricityTrait").pop()
    if (electricityTrait) {
        factory.power = electricityTrait.Properties.Parameters.ElectricityValue
        factory.powerType = electricityTrait.Properties.Parameters.Type.split("::").pop()
    }
    const temperatureTrait = jsonData.filter(jd => jd.Type == "CrMassTemperatureTrait").pop()
    if (temperatureTrait) {
        factory.heat = temperatureTrait.Properties?.TemperatureParameters?.CoolingCapacityUsing ?? 0
    }
    const buildingTrait = jsonData.filter(jd => jd.Type == "CrMassBuildingTrait").pop()
    if (buildingTrait) {
        const bd = shortenPath(buildingTrait.Properties.Parameters.PlacementData.ObjectPath)
        if (bd) {
            const bdFilePath = jsonFiles.find(path => path.endsWith(bd + ".json"))
            const bdData = await fetchFile(bdFilePath)
            const bdDataElement = bdData.find(e => e.Type == "CrBuildingData")
            if (bdDataElement) {
                const props = bdDataElement.Properties
                factory.icon = iconPath(props.Icon.ResourceObject.ObjectPath)
                const dt = props.BuildingName
                factory.name = translate(dt, translations)
                const dd = props.BuildingDescription
                if (dd) {
                    factory.description = translate(dd, translations) ?? dd.LocalizedString
                }
            }
        }
    }
    return factory
    // console.log('use', filePath.split("/").pop())
}

function convertCrItem(jsonData, translations) {
    const itemData = jsonData.filter(jd => jd.Properties?.UIItemType == "EUIItemType::Resource").pop()
    //identify
    itemData.type = "material"
    //ignored props
    delete itemData.Name
    delete itemData.Flags
    delete itemData.Class
    delete itemData.Package
    delete itemData.Properties.StackingType
    delete itemData.Properties.MaxStack
    delete itemData.Properties.bCanBeSelectedInStorage
    delete itemData.Properties.StatsToGiveGE2
    delete itemData.Properties.UniqueItemName
    delete itemData.Properties.PickupClass
    delete itemData.Properties.ItemMesh
    delete itemData.Properties.GatheredFrom
    delete itemData.Properties.UIItemType
    delete itemData.Properties.bShowItemName
    delete itemData.Properties.bRandomizedTransform
    delete itemData.Properties.UICraftingType
    delete itemData.Properties.EntityType
    delete itemData.Properties.ItemTags
    delete itemData.Properties.SystemAbilities

    //converted props
    // console.debug(jsonData.Type)
    itemData.internalId = itemData.Type
    delete itemData.Type
    const props = itemData.Properties
    itemData.icon = iconPath(props.ItemIcon.ResourceObject.ObjectPath)
    delete props.ItemIcon
    const dt = props.ItemName
    itemData.name = translate(dt, translations)
    delete props.ItemName
    const dd = props.ItemDescription
    if (dd) {
        itemData.description = translate(dd, translations) ?? dd.LocalizedString
        delete props.ItemDescription
    }
    itemData.level = props.Level
    delete props.Level
    itemData.faction = props.Corporation
    delete props.Corporation

    // check remaining props
    if (Object.keys(props).length > 0) {
        console.log('missed: ', Object.keys(props))
    } else {
        delete itemData.Properties
    }
    if (!itemData.name) {
        console.log('skipped', itemData.internalId)
        return null
    }
    const bpData = jsonData.filter(jd => jd.Type == "BlueprintGeneratedClass").pop()
    if (bpData) {
        itemData.internalId = shortenPath(bpData.ClassDefaultObject.ObjectPath)
    }
    return itemData
}

function convertCrRecipe(jsonData, translations, filePath) {
    const excludes = [
        "FoodProcessor",
        //skip advanced drilling recipes
        "CR_CalciumOreImpure_LaserDrill",
        "CR_CalciumOrePure_LaserDrill",
        "CR_CalciumOre_LaserDrill",
        "CR_TitaniumOreImpure_LaserDrill",
        "CR_TitaniumOrePure_LaserDrill",
        "CR_TitaniumOre_LaserDrill",
        "CR_WolframOreImpure_LaserDrill",
        "CR_WolframOrePure_LaserDrill",
        "CR_WolframOre_LaserDrill",
        "CR_CalciumOreImpure_MechanicalDrill",
        "CR_CalciumOrePure_MechanicalDrill",
        "CR_TitaniumOreImpure_MechanicalDrill",
        "CR_TitaniumOrePure_MechanicalDrill",
        "CR_WolframOreImpure_MechanicalDrill",
        "CR_WolframOrePure_MechanicalDrill",
        "CR_CalciumOreImpure_MechanicalDrillTier2",
        "CR_CalciumOrePure_MechanicalDrillTier2",
        "CR_TitaniumOreImpure_MechanicalDrillTier2",
        "CR_TitaniumOrePure_MechanicalDrillTier2",
        "CR_WolframOreImpure_MechanicalDrillTier2",
        "CR_WolframOrePure_MechanicalDrillTier2",
    ]
    if (excludes.find((ex) => filePath.indexOf(ex) > -1)) {
        //console.log('skip', filePath.split("/").pop())
        return
    }
    if (filePath.indexOf("Drill") >= 0) {
        console.log(filePath.split("\\").pop())
    }

    const recipeData = jsonData.filter(jd => jd.Type == "CrItemRecipeData").pop()
    //identify
    recipeData.type = "recipe"
    //ignored props
    delete recipeData.Type
    delete recipeData.Flags
    delete recipeData.Class
    delete recipeData.Package
    delete recipeData.Properties.bShowOutputItemIcon
    delete recipeData.Properties.BaseRecipe
    delete recipeData.Properties.SendNotificationToDialogueSystem
    delete recipeData.Properties.bSkipDialoguesRulesCheck
    //converted props
    // console.debug(jsonData.Name)
    recipeData.internalId = recipeData.Name
    if (recipeData.internalId == "CR_BasicElectronics" || recipeData.internalId == "CR_WolframBar_Printed") {
        // skip unused CR_BasicElectronics and CR_WolframBar_Printed
        return
    }
    delete recipeData.Name
    const props = recipeData.Properties
    recipeData.icon = iconPath(props.Icon.ResourceObject.ObjectPath)
    delete props.Icon
    const dt = props.DisplayText
    recipeData.name = translate(dt, translations)
    delete props.DisplayText
    recipeData.quantity = props.OutputItem.Count
    recipeData.output = shortenPath(props.OutputItem.Item.ObjectPath)
    delete props.OutputItem
    recipeData.time = props.BuildTime ?? 10
    delete props.BuildTime
    const dd = props.DisplayDescription
    if (dd) {
        recipeData.description = translate(dd, translations) ?? dd.LocalizedString
        delete props.DisplayDescription
    }
    const needed = props.NeededResources
    if (needed) {
        recipeData.ingredients = needed.map((n) => ({
            id: shortenPath(n.Item.ObjectPath),
            amount: n.Count
        }))
        delete props.NeededResources
    }
    const unlocks = props.UnlockRequirements
    if (unlocks) {
        recipeData.unlock = unlocks.map((u) => ({
            id: shortenPath(u.Key),
            amount: u.Value
        }))
        delete props.UnlockRequirements
    }
    recipeData.level = props.Level
    delete props.Level
    recipeData.faction = props.Corporation
    delete props.Corporation

    // check remaining props
    if (Object.keys(props).length > 0) {
        console.log('missed: ', Object.keys(props))
    } else {
        delete recipeData.Properties
    }
    return recipeData
}

function translate(item, translations) {
    if (!translations) {
        return item.SourceString
    }
    if (item.Namespace) {
        const translated = translations[item.Namespace][item.Key]
        if (!translated) {
            console.log(item.Namespace, item.Key)
        }
        return translated
    }
    if (item.TableId) {
        let namespace = shortenPath(item.TableId);
        if (namespace == "Buildings") {
            namespace = "UIForgottenEngine"
        }
        const translated = translations[namespace][item.Key]
        if (!translated) {
            console.log(namespace, item.Key)
        }
        return translated
    }
}

function shortenPath(path) {
    return path.split("/").pop().split("\.")[0]
}

function iconPath(path) {
    return path.split("\.")[0].split("/").slice(3).join("/")
}

combineJsonFiles();