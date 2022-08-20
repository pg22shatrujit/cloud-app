// Copyright (C) Shatrujit Aditya Kumar 2022, All Rights Reserved

'use strict'

import Connection from "./connection"
import Axios from 'axios'
import { INDEX_NONE, PlayerState } from "../../server/tData";

// Import the functions you need from the SDKs you need
import { collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db, TELEMETRY_COLLECTION, STATE_AGGREGATE_COLLECTION, LOCATION_AGGREGATE_COLLECTION, LOCATION_MAXIMUM_KEY, LOCATION_OBJECTS_KEY, getAggregationReference } from "../../functions/FirestoreSetup"

const baseURL = `http://localhost:5001`
const prefix = `/telemetrytracking/us-central1`

// Commonly used values as constants
const FUNCTIONS_URL = 'https://us-central1-telemetrytracking.cloudfunctions.net/'

export default class FirebaseConnection extends Connection {

    constructor() {
        super()

        this.functions = Axios.create({ baseURL: FUNCTIONS_URL })
        this.functionsAPI = Axios.create({ baseURL: baseURL })
    }

    open() {}

    execute( request, data ) {
        return new Promise(( resolve, reject ) => {

            this.functions.get('helloWorld')
            .then( result => {
                resolve()
            })
            .catch( error => reject( error ))
        })
    }

    read( request ) {
        let id = this.getID( request )

        // If id exists, it's a single read
        if(id) {

            return new Promise(( resolve, reject ) => {

                getDoc( doc( db, TELEMETRY_COLLECTION, id ))
                .then( docSnapshot => {
                    let record = { ...docSnapshot.data() }
                    record.id = id
                    resolve( record )
                })
                .catch( error => reject( error ))
            })
        }

        // If not, read all
        return new Promise(( resolve, reject ) => {

            getDocs( collection( db, TELEMETRY_COLLECTION ))
            .then( querySnapshot => {

                // Iterate through the snapshot and create an object of all values
                let docList = {}
                querySnapshot.forEach((doc) => {
                    docList[doc.id] = doc.data()
                    docList[doc.id].id = doc.id
                })
                resolve( docList )
            })
            .catch(error => reject( error ))
        })

    }

    // Always writes a single entry
    write( request, data ) {

        let id = this.getID( request )

        // Early return if there is no id
        if( !id ) return

        // Copy the record from the class and delete id if it exists
        let record = { ...data.record }
        if( record.id ) delete record.id

        return new Promise(( resolve, reject ) => {

            // ID is not the default
            if( id != INDEX_NONE ) {
                
                getDoc( doc( db, TELEMETRY_COLLECTION, id ))
                .then( docSnapshot => {
                    // Update if the doc exists
                    if( docSnapshot.exists() ) {

                        setDoc( doc( db, TELEMETRY_COLLECTION, id ), record, { merge: true } )
                        .then( result => resolve( id ))
                        .catch( error => reject( error ))
                    }
                    // Create a new doc if it doesn't 
                    else {

                        addDoc( collection( db, TELEMETRY_COLLECTION ), record )
                        .then( result => resolve( result.id ))
                        .catch( error => reject( error ))
                    }
                })
    
            } 
            else {

                // If id is the default, create a new record
                addDoc( collection(db, TELEMETRY_COLLECTION), record )
                .then( result => resolve( result.id ))
                .catch( error => reject( error ))
            }
        })
    }

    // Always writes a single entry
    delete( request ) {

        let id = this.getID( request )

        // Early return if there is no id
        if( !id ) return
        
        return new Promise(( resolve, reject ) => {
            
            // Delete record by id
            deleteDoc( doc(db, TELEMETRY_COLLECTION, id ))
            .then( result => resolve( result ))
            .catch( error => reject( error ))
        })
    }

    loadVizData( isHeatMap = false ) {

        return new Promise(( resolve, reject ) => {

            getAggregationReference( isHeatMap ? LOCATION_AGGREGATE_COLLECTION : STATE_AGGREGATE_COLLECTION )
            .then( aggregationsRef => {
                if ( !aggregationsRef ) reject("Couldn't find document reference")

                getDoc( aggregationsRef )
                .then( aggregationsDoc => {

                    resolve( aggregationsDoc.data() ) 
                })
                .catch( error => reject( error ) )
            })
            .catch( error => reject( error ) )
        })
    }

    getChartData() {

        return new Promise(( resolve, reject ) => {

            this.loadVizData()
            .then( data => {
                let formattedData = [
                    [ "Player State", "Occurances" ]
                ]

                Object.keys( PlayerState ).forEach( ( state ) => {
                    let stateVal = data.hasOwnProperty( PlayerState[ state ] ) ? data[ PlayerState[ state ] ]: 0
                    formattedData.push( [ state, stateVal ] )
                })
                
                resolve( formattedData ) 
            })
        })
    }

    getHeatMapData() {

        return new Promise(( resolve, reject ) => {

            this.loadVizData( true )
            .then( data => {
                
                let mapData = []
                let aggregatedLocations = data[ LOCATION_OBJECTS_KEY ]
                for( let xKey in aggregatedLocations ) {
                    for( let yKey in aggregatedLocations[ xKey ] ) {
                        mapData.push({
                            x: xKey,
                            y: yKey,
                            value: aggregatedLocations[ xKey ][ yKey ]
                        })
                    }
                }
                
                let formattedData = {
                    [LOCATION_MAXIMUM_KEY]: data[LOCATION_MAXIMUM_KEY],
                    [LOCATION_OBJECTS_KEY]: mapData
                }

                resolve( formattedData )
            })
        })
    }

    // Break request params and get the id
    getID( request ) {
        return request.split("/")[2]
    }

    close() {}
}