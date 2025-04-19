const eventManager = new globalThis.EventManager();

console.log('event manager running');

for await (const data of eventManager) {
	if (data) {
		switch (data.event_type) {
			case 'Log':
				switch (data.event.level) {
					case 'Error':
						console.error(`[error] ${data.event.msg}`);
						break;
					case 'Warning':
						console.warn(`[warning] ${data.event.msg}`);
						break;
					case 'Info':
						console.info(`[info] ${data.event.msg}`);
						break;
					case 'Debug':
						console.debug(`[debug] ${data.event.msg}`);
						break;
			}
			break;
			default:
				console.dir(data, { depth: Infinity });
		}
	}
}

console.log('event manager exiting');
