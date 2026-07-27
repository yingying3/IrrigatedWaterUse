/**
 * ============================================================================
 * Thornthwaite-Mather Monthly Irrigation Water Use (IWU), updated to include soil drainage processes
 * Google Earth Engine (GEE) Implementation
 * ============================================================================
 *
 * INPUTS
 * -------
 * P      : Rainfall (AGCD)
 * AET    : Actual Evapotranspiration (CMRSET)
 * TWC    : Total Water Capacity
 * Ksat   : Saturated Hydraulic Conductivity
 *
 * DRAINAGE OPTIONS
 * ----------------
 * 1. AWRA-L quadratic drainage (default)
 * 2. Linear field-capacity drainage
 *
 * OUTPUTS
 * --------
 * IWUnet        : Net irrigation water requirement
 * GWET          : Green water evapotranspiration
 * AETminusP     : Actual evapotranspiration minus precipitation
 * Drainage      : Soil drainage
 * SoilMoisture  : Soil moisture after drainage
 *
 * ASSOCIATED MANUSCRIPT
 * ----------------------
 * Integrating Landsat-based irrigation mapping and actual
 * evapotranspiration estimates with hydrological modelling to assess
 * regional irrigation dynamics in a large basin experiencing extreme
 * climate variability: Towards a national operational irrigation water
 * accounting system
 *
 * AUTHORS
 * --------
 * Jorge L. Peña-Arancibia
 * Yingying Yu
 * Tim R. McVicar
 * Tom G. Van Niel
 * Francis H.S. Chiew
 * Darin Hodgson
 * Jamie Vleeshouwer
 * Aarond Dino
 * Zachary Browne
 * Anthony Nadelkoe
 *
 * Citation:
 * ============================================================================
 */

// =====================================================
// 1. USER SETTINGS
// =====================================================

// Site
var ROI = ee.Geometry.Point(150.090833, -30.697222).buffer(150);
var title = 'MyallValeB - irrigated';

// Time period
var start = ee.Date('2018-09-01');
var end   = ee.Date('2025-04-01');

// Drainage method
// true  = AWRA-L quadratic drainage
// false = Linear FC drainage
var useAwraDrainage = true;

// Linear drainage coefficient (used only when useAwraDrainage = false)
var drainageCoeff = 0.5;

// Field capacity fraction of total water capacity
var FC_fraction = 0.5;

// =====================================================
// 2. INPUT DATASETS (Manuscript , Section 2.2)
// =====================================================

// AGCD daily rainfall
// https://trove.nla.gov.au/work/239025811
var Pday_col =
  ee.ImageCollection('projects/tern-landscapes/AGCD/Daily')
  .select('rain');

// CMRSET ETa
// https://developers.google.com/earth-engine/datasets/catalog/TERN_AET_CMRSET_LANDSAT_V2_2
var ETa_col = // 
  ee.ImageCollection('TERN/AET/CMRSET_LANDSAT_V2_2')
  .select('ETa');

// Total water capacity
// https://esoil.io/TERNLandscapes/Public/Pages/SLGA/index.html
var TWC = ee.Image(
  'projects/ee-jorgepena/assets/Irrigation/AWC_AU_0_100_mm'
).toFloat();
// Saturated hydraulic conductivity (Manuscript , Section 2.2.4)
var Ksat = ee.Image(
  'projects/ee-jorgepena/assets/Irrigation/Ksat_AU_0_100_mm'
).toFloat();
// Initial soil moisture = 0.5*TWC
var SM0 = TWC.multiply(0.5).rename('SM0');
// Field capacity
// assuming soil moisture (SM0) starts at 50% of storage capacity SM0=0.5×TWC
var FC = TWC.multiply(FC_fraction);



/* =====================================================================
   HELPER FUNCTIONS
===================================================================== */

// ----------------------------------------------------
// Calculate drainage
// ----------------------------------------------------
function calculateDrainage(SM_afterET) { // SM_afterET: soil moisture after evapotranspiration
  if (useAwraDrainage) {
    // AWRA-L style drainage (default)
    // Q = Ksat_month * (SM_afterET / TWC)^2,  
    // See Eq7 and 8 in the manuscript
    var relSM = SM_afterET  // Relative soil moisture
      .divide(TWC)
      .clamp(0, 1);
    var drainagePotential =  
      Ksat.multiply(relSM.pow(2));
    return drainagePotential 
      .min(SM_afterET)
      .rename('Q')
      .toFloat();
  } else {
    // Linear drainage
    // Drainage is limited so it cannot exceed the amount of water currently stored in the soil.
    // Q = k * max(0, SM_afterET - FC)
    var excessFC =
      SM_afterET.subtract(FC).max(0);
    return excessFC
      .multiply(drainageCoeff)
      .min(SM_afterET)
      .rename('Q')
      .toFloat();
  }
}

// ----------------------------------------------------
// Standard chart function
// ----------------------------------------------------
function makeChart(bands, chartTitle, yTitle, colors) {

  return ui.Chart.image.series({
    imageCollection: outCol.select(bands),
    region: ROI,
    reducer: ee.Reducer.mean(),
    scale: 30,
    xProperty: 'system:time_start'
  }).setOptions({
    title: chartTitle,
    lineWidth: 2,
    vAxis: {title: yTitle},
    colors: colors
  });
}

/* =====================================================================
   MONTHLY SOIL WATER BALANCE MODEL
===================================================================== */

// Get the current model state from the previous iteration
var iterateMonths = function(monthIndex, modelState) {
  modelState = ee.Dictionary(modelState);

  // Current month number in the simulation
  var m = ee.Number(monthIndex);

  // Start and end dates for the current month
  var monthStart = start.advance(m, 'month');
  var monthEnd   = monthStart.advance(1, 'month');

  // Number of days in the current month
  var daysInMonth =
    monthEnd.difference(monthStart, 'day');

  // Retrieve the output list from the previous step,
  // or create an empty list for the first month
  var outList = ee.List(
    ee.Algorithms.If(
      modelState.contains('outList'),
      modelState.get('outList'),
      ee.List([])
    )
  );

  // --------------------------------------------------
  // Climate Inputs
  // --------------------------------------------------
  // Sum daily rainfall over the month to total monthly rainfall
  var P = Pday_col
    .filterDate(monthStart, monthEnd)
    .sum()
    .rename('P')
    .unmask(0)
    .clip(ROI)
    .toFloat();
  // total monthly ETa
  var ETm = ETa_col
    .filterDate(monthStart, monthEnd)
    .mean()
    .multiply(daysInMonth)
    .rename('ETm')
    .toFloat();


  // --------------------------------------------------
  // Water Inputs
  // --------------------------------------------------

  // Previous month's soil moisture
  // Use the initial soil moisture (SM0) for the first month,
  // otherwise use the soil moisture from the previous month.
  var SM_prev = ee.Image(
    ee.Algorithms.If(
      m.eq(0),
      SM0,
      ee.Image(outList.get(-1)).select('SM')
    )
  ).toFloat();
  // 1) Add monthly rainfall to the soil store
  // Eq 2 in the manuscript
  var SM_postP =
    SM_prev.add(P).toFloat();
  // 2) Calculate green water ET
  // Eq 3 in the manuscript
  var GWET =
    SM_postP.min(ETm)
    .rename('GWET')
    .toFloat();
  // 3) Irrigation required to meet ET demand in this month
  // Eq 4 in the manuscript
  // IWUnet = max(0, ETm - GWET)
  var IWUnet =
    ETm.subtract(GWET)
       .max(0)
       .rename('IWUnet')
       .toFloat();
  // 4) Apply irrigation to soil before ET (so ET can be supplied this month)
  // Eq 5 in the manuscript
  var SM_postIrr =
    SM_postP.add(IWUnet);
  // 5) Actual ET (should equal ETm)
  var AET =
    GWET.add(IWUnet)
        .rename('AET')
        .toFloat();
  // 6) soil after ET (before drainage)
  // Eq 6 in the manuscript
  var SM_afterET =
    SM_postIrr.subtract(AET)
              .max(0)
              .toFloat();

  // --------------------------------------------------
  // Drainage
  // --------------------------------------------------
  // See Eq7 and 8 in the manuscript
  var Q =
    calculateDrainage(SM_afterET);

  // --------------------------------------------------
  // Update Soil Storage
  // --------------------------------------------------
  // See Eq9 in the manuscript
  var SM_end = // soil at end after drainage (mm), bounded [0, TWC]
    SM_afterET
      .subtract(Q)
      .max(0)
      .min(TWC)
      .rename('SM')
      .toFloat();

  var SM_per = // // soil at end after drainage (%)
    SM_end
      .divide(TWC)
      .clamp(0,1)
      .multiply(100)
      .rename('SM_per')
      .toFloat();

  // change in water storage
  // See Eq10 in the manuscript
  var deltaSM = // change in storage
    SM_end.subtract(SM_prev)
          .rename('deltaSM')
          .toFloat();

  var AETminusP =
    AET.subtract(P)
       .max(0)
       .rename('AETminusP');


  // --------------------------------------------------
  // Output Image
  // --------------------------------------------------
  // Create output image containing all monthly water balance variables  
  var outImg = ETm.addBands([
      AETminusP,   // ETa minus rainfall
      GWET,        // Green water ET 
      IWUnet,      // Net irrigatio water use
      SM_end,      // End of month soil moisture
      deltaSM,     // Change in soil moisture
      Q,           // Drainage
      SM_per       // Soil moisture as % of total water capacity
    ])
    .set('system:time_start', monthStart.millis()) // Set date for this monthly output
    .set('monthIndex', m)                           
    .toFloat();

  // Add current month's results to the output list
  var outListNew = outList.add(outImg);
  
  // Return updated model state for the next month
  return ee.Dictionary({
    SM_prev: SM_end,
    outList: outListNew
  });
};


/* =====================================================================
   RUN MODEL
===================================================================== */
// Create a list of monthly time steps for the simulation period
var months = ee.List.sequence(
  0,
  end.difference(start, 'month').subtract(1)
);

// Initialize model state with starting soil moisture
// and an empty list for outputs
var initDict = ee.Dictionary({
  SM_prev: SM0,
  outList: ee.List([])
});

// Run the monthly water balance model
var result =
  months.iterate(iterateMonths, initDict);

// Convert results to a dictionary
var resultDict =
  ee.Dictionary(result);

// Extract the list of monthly output images
var outList =
  ee.List(resultDict.get('outList'));

// Convert outputs to an ImageCollection
var outCol =  // final outputs
  ee.ImageCollection(outList);


/* =====================================================================
   CHARTS
===================================================================== */
// Plot AET minus rainfall and net irrigation water use
print(
  makeChart(
    ['AETminusP', 'IWUnet'],
    title + ' | AET-P and IWUnet',
    'mm/month',
    ['red', 'blue']
  )
);

// Plot monthly ET, green water ET and irrigation water use
print(
  makeChart(
    ['ETm', 'GWET', 'IWUnet'],
    'ETm, GWET and IWUnet',
    'mm/month',
    ['black', 'orange', 'purple']
  )
);

// Plot soil moisture
print(
  makeChart(
    ['SM'],
    'Soil Moisture',
    'mm',
    ['brown']
  )
);

// Plot monthly drainage
print(
  makeChart(
    ['Q'],
    'Deep Drainage (Q)',
    'mm/month',
    ['blue']
  )
);

// Plot soil moisture as percentage of TWC
print(
  makeChart(
    ['SM_per'],
    'Soil Moisture (%)',
    '%',
    ['orange']
  )
);
