import * as figlet from 'figlet'

export default {
  async fetch() {
    console.log("Hello from Workers!");
    console.error("Error from Workers!");
    // Not handled by the edge runtime, debug is info and warn is error
    // console.warn("Warning from Workers!");
    // console.debug("Debug from Workers!");
    
    return new Response(JSON.stringify({
      message: await figlet.text("Ok !")
    }));
  },
};
