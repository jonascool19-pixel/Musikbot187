import {defineConfig} from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
const browserData=path.join(os.tmpdir(),`musikbot187-browser-${process.pid}`);
export default defineConfig({testDir:'browser-tests',timeout:30000,use:{baseURL:'http://127.0.0.1:33187'},webServer:{command:`"${process.execPath}" src/server.js`,port:33187,reuseExistingServer:!process.env.CI,env:{MUSIKBOT187_PORT:'33187',MUSIKBOT187_HOST:'127.0.0.1',MUSIKBOT187_DATA_DIR:browserData,MUSIKBOT187_FRONTEND_DIR:'../frontend',MUSIKBOT187_SETUP_TOKEN:'browser-setup-token'}}});
