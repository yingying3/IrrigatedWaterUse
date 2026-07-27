# Irrigated water use, GEE analysis code
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21620442.svg)](https://doi.org/10.5281/zenodo.21620442)

Integrating Landsat-based irrigation mapping and actual evapotranspiration estimates with hydrological modelling to assess regional irrigation dynamics
Google Earth Engine (GEE) scripts

## Overview
This repository contains the Google Earth Engine scripts used for remote sensing analysis and data processing associated with a scientific study.
For details of the scientific application, please refer to the associated publication once available.

## Requirements
- Google Earth Engine account
- Access to datasets referenced in the scripts

## Files in Example folder
- GEE_IWU.js: Main processing workflow

## Usage
1. Open the script in Google Earth Engine Code Editor.
2. Import/Define the area of interest and time period.
```javascript
// Area of Interest
var ROI = ee.Geometry.Point(150.090833, -30.697222).buffer(150);
// Time period
var start = ee.Date('2018-09-01');
var end   = ee.Date('2025-04-01');
```
3. Update images (image collections) and asset paths if required.
```javascript
// AGCD daily rainfall, https://trove.nla.gov.au/work/239025811
var Pday_col = ee.ImageCollection('projects/tern-landscapes/AGCD/Daily').select('rain');
// CMRSET ETa, https://developers.google.com/earth-engine/datasets/catalog/TERN_AET_CMRSET_LANDSAT_V2_2
var ETa_col = ee.ImageCollection('TERN/AET/CMRSET_LANDSAT_V2_2').select('ETa');
// Total water capacity, https://esoil.io/TERNLandscapes/Public/Pages/SLGA/index.html
var TWC = ee.Image('projects/ee-jorgepena/assets/Irrigation/AWC_AU_0_100_mm').toFloat();
// Saturated hydraulic conductivity
var Ksat = ee.Image('projects/ee-jorgepena/assets/Irrigation/Ksat_AU_0_100_mm').toFloat();
```
4. Run the workflow to estimate monthly irrigation water use (IWU).
5. Time-series visualisation

## Authors
Jorge L. Peña-Arancibia, Yingying Yu, Tim R. McVicar, Tom G. Van Niel, Francis H.S. Chiew, Darin Hodgson, Jamie Vleeshouwer, Aarond Dino, Zachary Brown, and Anthony Nadelko

## Citation

Associated publication:

Jorge L. Peña-Arancibia, Yingying Yu, Tim R. McVicar, Tom G. Van Niel, Francis H.S. Chiew, Darin Hodgson, Jamie Vleeshouwer, Aarond Dino, Zachary Brown and Anthony Nadelko, 2026, Integrating Landsat-based irrigation mapping and actual evapotranspiration estimates with hydrological modelling to assess regional irrigation dynamics in a large basin experiencing extreme climate variability: Towards a national operational irrigation water accounting system, Remote Sensing of Environment. Under Review.

Code DOI:
https://doi.org/10.5281/zenodo.21614019
