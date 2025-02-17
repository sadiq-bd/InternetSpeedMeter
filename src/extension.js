/*
 * Name: Internet Speed Meter
 * Description: A simple and minimal internet speed meter extension for Gnome Shell.
 * Author: Sadiq
 * GitHub: https://github.com/sadiq-bd/InternetSpeedMeter
 * License: GPLv3.0
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class InternetSpeedMeter extends Extension {

  static refreshTimeInSeconds = 1;
  static unitBase = 1024.0; // 1 GB == 1024MB, 1MB == 1024KB, etc.
  static units = ["KB/s", "MB/s", "GB/s", "TB/s", "PB/s", "EB/s"];
  static defaultNetSpeedText = "⇅ -.-- --";

  prevUploadBytes = 0;
  prevDownloadBytes = 0;
  container = null;
  netSpeedLabel = null;
  timeoutId = 0;

  // Read total download and upload bytes from /proc/net/dev
  getBytes() {
    try {
      const lines = Shell.get_file_contents_utf8_sync("/proc/net/dev").split("\n");
      let downloadBytes = 0, uploadBytes = 0;

      for (const line of lines) {
        const columns = line.trim().split(/\W+/);
        if (columns.length < 10) continue;

        // Ignore virtual and local interfaces
        if (/^(lo|br[0-9]+|tun[0-9]+|tap[0-9]+|vnet[0-9]+|virbr[0-9]+|(veth|br-|docker0)[a-zA-Z0-9]+)/.test(columns[0])) {
          continue;
        }

        const download = parseInt(columns[1]), upload = parseInt(columns[9]);
        if (!isNaN(download) && !isNaN(upload)) {
          downloadBytes += download;
          uploadBytes += upload;
        }
      }

      return [downloadBytes, uploadBytes];
    } catch (e) {
      log(`Error reading /proc/net/dev: ${e}`);
      return [0, 0];
    }
  }

  // Format bytes to a readable string, starting from KB
  getFormattedSpeed(speed) {
    if (speed < 1) return `0.00 KB`; // Ensure minimum is KB

    const { unitBase, units } = InternetSpeedMeter;
    const i = Math.min(Math.floor(Math.log(speed) / Math.log(unitBase)), units.length - 1);
    return `${(speed / Math.pow(unitBase, i)).toFixed(2)} ${units[i]}`;
  }

  // Update current net speed in the shell
  updateNetSpeed() {
    if (!this.netSpeedLabel) return false;

    try {
      const [downloadBytes, uploadBytes] = this.getBytes();

      // Calculate speeds (KB/s)
      const downloadSpeed = (downloadBytes - this.prevDownloadBytes) / InternetSpeedMeter.unitBase;
      const uploadSpeed = (uploadBytes - this.prevUploadBytes) / InternetSpeedMeter.unitBase;

      this.netSpeedLabel.set_text(`🠧 ${this.getFormattedSpeed(downloadSpeed)}   🠥 ${this.getFormattedSpeed(uploadSpeed)}`);

      this.prevDownloadBytes = downloadBytes;
      this.prevUploadBytes = uploadBytes;
      return true;
    } catch (e) {
      log(`Error updating internet speed: ${e}`);
      this.netSpeedLabel.set_text(InternetSpeedMeter.defaultNetSpeedText);
    }

    return false;
  }

  enable() {
    this.container = new St.Bin({ reactive: true, can_focus: false, x_expand: true, y_expand: false, track_hover: false });
    this.netSpeedLabel = new St.Label({ text: InternetSpeedMeter.defaultNetSpeedText, style_class: "netSpeedLabel", y_align: Clutter.ActorAlign.CENTER });
    this.container.set_child(this.netSpeedLabel);
    Main.panel._rightBox.insert_child_at_index(this.container, 0);

    // Initialize previous bytes
    [this.prevDownloadBytes, this.prevUploadBytes] = this.getBytes();

    // Start update loop
    this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, InternetSpeedMeter.refreshTimeInSeconds, this.updateNetSpeed.bind(this));
  }

  disable() {
    if (this.timeoutId) {
      GLib.Source.remove(this.timeoutId);
      this.timeoutId = 0;
    }
    if (this.container) {
      Main.panel._rightBox.remove_child(this.container);
      this.container.destroy();
      this.container = null;
    }
    this.netSpeedLabel = null;
  }
}
