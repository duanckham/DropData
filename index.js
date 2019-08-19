const fs = require('fs');
const low = require('lowdb');
const fetch = require('isomorphic-fetch');
const { Dropbox } = require('dropbox');
const FileSync = require('lowdb/adapters/FileSync');

class DropData {
  constructor(options) {
    this._readyCallback;
    this._version = 0;
    this._options = options;
    this._dbx = new Dropbox({
      accessToken: options.accessToken,
      fetch,
    });

    this._remotePaths = {
      file: `/${options.project}/${options.name}.json`,
      version: `/${options.project}/${options.name}.version`,
    };

    this.looper();
  }

  async sync() {
    let { path, name } = this._options;
    let localeFilePath = `${path}/${name}.json`;
    let localeVersionPath = `${path}/${name}.version`;

    let localeFileExisted = false;
    let remoteFileExisted = false;

    let localeFileVersion = 0;
    let remoteFileVersion = 0;

    let filesListFolderRes;

    try {
      filesListFolderRes = await this._dbx.filesListFolder({ path: '/' + this._options.project });
    } catch (err) {
      if (this._options.debug) {
        console.log('* filesListFolder err:');
        console.log(err);
      }
    }

    // Read locale file.
    if (fs.existsSync(localeFilePath)) {
      localeFileExisted = true;
      this._version = parseInt(fs.readFileSync(localeVersionPath));
    }

    // Read remote file.
    for (let i = filesListFolderRes.entries.length; i--;) {
      if (filesListFolderRes.entries[i].name === this._options.name + '.json') {
        let _versionDownloadRes;

        try {
          _versionDownloadRes = await this._dbx.filesDownload({ path: this._remotePaths.version });
        } catch (err) {
          if (this._options.debug) {
            console.log('* filesDownload err:');
            console.log(err);
          }
        }

        remoteFileExisted = true;
        remoteFileVersion = parseInt(_versionDownloadRes.fileBinary);
      }
    }

    if (this._options.debug) {
      console.log(`* localeFileExisted: ${localeFileExisted ? 'yes' : 'no'}`);
      console.log(`* remoteFileExisted: ${remoteFileExisted ? 'yes' : 'no'}`);
    }

    if (localeFileExisted) {
      if (remoteFileExisted) {
        // Compare.
        localeFileVersion = parseInt(fs.readFileSync(localeVersionPath));

        if (this._options.debug) {
          console.log(`* localeFileVersion: ${localeFileVersion}`);
          console.log(`* remoteFileVersion: ${remoteFileVersion}`);
        }

        if (localeFileVersion > remoteFileVersion) {
          await this.syncToRemote();
        } else if (localeFileVersion < remoteFileVersion) {
          await this.syncFromRemote();
        }
      } else {
        // Upload to remote.
        await this.syncToRemote();
      }
    } else {
      if (remoteFileExisted) {
        // Download to locale.
        await this.syncFromRemote();
      } else {
        // Create locale file and upload to remote.
        await this.initDataFile();
      }
    }
  }

  async syncFromRemote() {
    try {
      let { path, name } = this._options;

      // Download to locale.
      let _fileDownloadRes = await this._dbx.filesDownload({ path: this._remotePaths.file });
      let _versionDownloadRes = await this._dbx.filesDownload({ path: this._remotePaths.version });

      // Update local version.
      this._version = parseInt(_versionDownloadRes.fileBinary);

      // Yes, yes, yes.
      fs.writeFileSync(`${path}/${name}.json`, _fileDownloadRes.fileBinary);
      fs.writeFileSync(`${path}/${name}.version`, _versionDownloadRes.fileBinary);
    } catch (err) {
      if (this._options.debug) {
        console.log('* syncFromRemote err:');
        console.log(err);
      }
    }
  }

  async syncToRemote() {
    try {
      let { path, name } = this._options;

      // Delete remote files.
      await this._dbx.filesDeleteBatch({
        entries: [
          { path: this._remotePaths.file },
          { path: this._remotePaths.version },
        ]
      });

      // Upload.
      await this._dbx.filesUpload({
        path: this._remotePaths.file,
        contents: fs.readFileSync(`${path}/${name}.json`)
      });

      await this._dbx.filesUpload({
        path: this._remotePaths.version,
        contents: fs.readFileSync(`${path}/${name}.version`)
      });
    } catch (err) {
      if (this._options.debug) {
        console.log('* syncToRemote err:');
        console.log(err);
      }
    }
  }

  async initDataFile() {
    let { path, name } = this._options;
    let localeFilePath = `${path}/${name}.json`;
    let localeVersionPath = `${path}/${name}.version`;

    // Update local version.
    this._version = 1;

    // Create locale file.
    fs.writeFileSync(localeFilePath, JSON.stringify({}));
    fs.writeFileSync(localeVersionPath, this._version);

    // Upload to remote.
    await this.syncToRemote();
  }

  bindWrite() {
    let { path, name } = this._options;
    let localeVersionPath = `${path}/${name}.version`;

    this._write = this.db.write.bind(this.db);

    return () => {
      this._version++;
      this._write();

      fs.writeFileSync(localeVersionPath, this._version);
    };
  }

  looper() {
    let { path, name } = this._options;
    let processer = async () => {
      await this.sync();

      if (!this.adapter) {
        this.adapter = new FileSync(`${path}/${name}.json`);
        this.db = low(this.adapter);
        this.db.write = this.bindWrite();
        this._readyCallback(this.db);
      }
    };

    setInterval(processer.bind(this), 20000);
    processer();
  }

  ready(callback) {
    this._readyCallback = callback;
  }
}

module.exports = DropData;